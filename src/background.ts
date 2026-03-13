import {sanitizeGoogleAccountProfiles, syncGoogleAccountsMessageType} from '@/lib/google-accounts';
import {browserApi} from '@/lib/webextension';

const googleAccountChooserUrl =
  'https://accounts.google.com/AccountChooser?continue=https%3A%2F%2Fwww.google.com%2F&hl=en&rip=1&show_tos=0';
const scrapeAttempts = 8;
const scrapeRetryDelayMs = 450;
const tabLoadTimeoutMs = 15000;

type RuntimeMessage = {
  type?: string;
};

type NativeTabsApi = {
  onUpdated: {
    addListener(
      listener: (tabId: number, changeInfo: {status?: string}) => void,
    ): void;
    removeListener(
      listener: (tabId: number, changeInfo: {status?: string}) => void,
    ): void;
  };
};

const nativeRuntime = (
  globalThis as {
    browser?: {runtime?: {onMessage?: {addListener(listener: (...args: any[]) => unknown): void}}};
    chrome?: {runtime?: {onMessage?: {addListener(listener: (...args: any[]) => unknown): void}}};
  }
).browser?.runtime ?? (
  globalThis as {
    chrome?: {runtime?: {onMessage?: {addListener(listener: (...args: any[]) => unknown): void}}};
  }
).chrome?.runtime;

const nativeTabs = (
  globalThis as {
    browser?: {tabs?: NativeTabsApi};
    chrome?: {tabs?: NativeTabsApi};
  }
).browser?.tabs ?? (
  globalThis as {
    chrome?: {tabs?: NativeTabsApi};
  }
).chrome?.tabs;

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });
}

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!nativeTabs?.onUpdated) {
      resolve();
      return;
    }

    const timeoutId = globalThis.setTimeout(() => {
      nativeTabs.onUpdated.removeListener(handleUpdated);
      reject(new Error('Timed out while opening the Google account chooser.'));
    }, tabLoadTimeoutMs);

    function handleUpdated(updatedTabId: number, changeInfo: {status?: string}) {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
        return;
      }

      globalThis.clearTimeout(timeoutId);
      nativeTabs?.onUpdated.removeListener(handleUpdated);
      resolve();
    }

    nativeTabs.onUpdated.addListener(handleUpdated);
  });
}

function scrapeGoogleAccountsFromPage() {
  const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
  const ignoredLabels = new Set([
    'manage your google account',
    'hide more accounts',
    'show more accounts',
    'add another account',
    'sign out of all accounts',
    'use another account',
    'google account',
  ]);

  function normalizeText(value: string | null | undefined): string {
    return (value ?? '').replace(/\s+/gu, ' ').trim();
  }

  function isVisibleElement(element: Element): boolean {
    const style = globalThis.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function collectTextParts(container: Element): string[] {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textParts: string[] = [];
    let currentNode = walker.nextNode();

    while (currentNode) {
      const parentElement = currentNode.parentElement;
      const normalizedText = normalizeText(currentNode.textContent);

      if (parentElement && isVisibleElement(parentElement) && normalizedText) {
        if (textParts[textParts.length - 1] !== normalizedText) {
          textParts.push(normalizedText);
        }
      }

      currentNode = walker.nextNode();
    }

    return textParts;
  }

  function findAccountContainer(startingElement: Element, email: string): Element | null {
    let currentElement: Element | null = startingElement;
    let fallbackElement: Element | null = startingElement;

    for (let depth = 0; currentElement && depth < 8; depth += 1) {
      if (!isVisibleElement(currentElement)) {
        currentElement = currentElement.parentElement;
        continue;
      }

      const normalizedText = normalizeText(currentElement.textContent);
      const textParts = collectTextParts(currentElement);
      const hasAvatar = Boolean(currentElement.querySelector('img'));
      const containsEmail = normalizedText.toLowerCase().includes(email.toLowerCase());
      const looksLikeCard = normalizedText.length <= 260 && textParts.length <= 8;

      if (containsEmail) {
        fallbackElement = currentElement;
      }

      if (containsEmail && (hasAvatar || looksLikeCard)) {
        fallbackElement = currentElement;
      }

      if (containsEmail && hasAvatar && looksLikeCard) {
        return currentElement;
      }

      currentElement = currentElement.parentElement;
    }

    return fallbackElement;
  }

  function extractDisplayName(textParts: string[], email: string): string {
    for (const textPart of textParts) {
      const normalizedText = normalizeText(textPart);
      const loweredText = normalizedText.toLowerCase();
      const greetingMatch = /^hi,\s*(.+?)[!.]?$/iu.exec(normalizedText);

      if (!normalizedText || loweredText === email.toLowerCase()) {
        continue;
      }

      if (ignoredLabels.has(loweredText) || loweredText.startsWith('managed by ')) {
        continue;
      }

      if (greetingMatch?.[1]) {
        return greetingMatch[1].trim();
      }

      if (!normalizedText.includes('@')) {
        return normalizedText;
      }
    }

    return email;
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const discoveredAccounts: Array<{
    email: string;
    displayName: string;
    avatarUrl?: string;
  }> = [];
  const seenEmails = new Set<string>();
  let currentNode = walker.nextNode();

  while (currentNode) {
    const parentElement = currentNode.parentElement;
    const normalizedText = normalizeText(currentNode.textContent);

    if (!parentElement || !isVisibleElement(parentElement) || !normalizedText) {
      currentNode = walker.nextNode();
      continue;
    }

    const emailMatches = Array.from(normalizedText.matchAll(emailPattern));
    if (emailMatches.length === 0) {
      currentNode = walker.nextNode();
      continue;
    }

    for (const emailMatch of emailMatches) {
      const email = emailMatch[0].toLowerCase();
      if (seenEmails.has(email)) {
        continue;
      }

      const accountContainer = findAccountContainer(parentElement, email);
      if (!accountContainer) {
        continue;
      }

      const textParts = collectTextParts(accountContainer);
      const displayName = extractDisplayName(textParts, email);
      const avatarUrl = accountContainer.querySelector('img')?.getAttribute('src') ?? undefined;

      discoveredAccounts.push({
        email,
        displayName,
        avatarUrl: avatarUrl || undefined,
      });
      seenEmails.add(email);
    }

    currentNode = walker.nextNode();
  }

  return discoveredAccounts;
}

async function scrapeAccountsFromTab(tabId: number) {
  if (!browserApi?.scripting?.executeScript) {
    throw new Error('The scripting API is unavailable in this browser.');
  }

  const executionResults = await browserApi.scripting.executeScript({
    target: {tabId},
    func: scrapeGoogleAccountsFromPage,
  });
  const executionResult = executionResults[0]?.result;
  const sanitizedAccounts = sanitizeGoogleAccountProfiles(
    Array.isArray(executionResult)
      ? executionResult.map((account, index) => ({
          ...account,
          authuser: index,
        }))
      : [],
  );

  return sanitizedAccounts;
}

async function loadGoogleAccounts() {
  const createdTab = await browserApi?.tabs.create({
    url: googleAccountChooserUrl,
    active: false,
  });
  const tabId = createdTab?.id;

  if (typeof tabId !== 'number') {
    throw new Error('Failed to open the Google account chooser tab.');
  }

  try {
    await waitForTabLoad(tabId);

    for (let attempt = 0; attempt < scrapeAttempts; attempt += 1) {
      const accountProfiles = await scrapeAccountsFromTab(tabId);
      if (accountProfiles.length > 0) {
        return accountProfiles;
      }

      await delay(scrapeRetryDelayMs);
    }

    throw new Error('Please sign in to a Google account first.');
  } finally {
    try {
      await browserApi?.tabs.remove(tabId);
    } catch (error) {
      console.warn('Failed to close the Google account chooser tab.', error);
    }
  }
}

function handleRuntimeMessage(
  message: RuntimeMessage,
  _sender: unknown,
  sendResponse: (response: {accounts?: unknown; error?: string}) => void,
) {
  if (message?.type !== syncGoogleAccountsMessageType) {
    return false;
  }

  void loadGoogleAccounts()
    .then((accountProfiles) => {
      sendResponse({accounts: accountProfiles});
    })
    .catch((error) => {
      console.error('Failed to sync Google accounts.', error);
      sendResponse({
        error: error instanceof Error ? error.message : 'Failed to load Google accounts.',
      });
    });

  return true;
}

nativeRuntime?.onMessage?.addListener?.(handleRuntimeMessage);
