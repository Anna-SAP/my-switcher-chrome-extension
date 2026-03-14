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

type ScrapedGoogleAccount = {
  email: string;
  displayName: string;
  avatarUrl?: string;
  authuser?: number;
  isPrimary?: boolean;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeScrapedAccounts(rawAccounts: unknown): ScrapedGoogleAccount[] {
  if (!Array.isArray(rawAccounts)) {
    return [];
  }

  const discoveredAccounts = rawAccounts.flatMap((account) => {
    if (!isRecord(account)) {
      return [];
    }

    const email = typeof account.email === 'string' ? account.email.trim().toLowerCase() : '';
    const displayName = typeof account.displayName === 'string' ? account.displayName.trim() : '';
    const avatarUrl = typeof account.avatarUrl === 'string' ? account.avatarUrl.trim() : '';
    const authuser = Number(account.authuser);
    const isPrimary = account.isPrimary === true;

    if (!email || !displayName) {
      return [];
    }

    return [
      {
        email,
        displayName,
        avatarUrl: avatarUrl || undefined,
        authuser:
          Number.isInteger(authuser) && authuser >= 0 ? authuser : undefined,
        isPrimary,
      },
    ];
  });

  const usedAuthusers = new Set<number>();
  const accountsWithResolvedAuthuser = discoveredAccounts.map((account) => {
    if (account.authuser === undefined || usedAuthusers.has(account.authuser)) {
      return {
        ...account,
        authuser: undefined,
      };
    }

    usedAuthusers.add(account.authuser);
    return account;
  });

  const availableAuthusers = Array.from(
    {length: accountsWithResolvedAuthuser.length},
    (_value, index) => index,
  ).filter((authuser) => !usedAuthusers.has(authuser));

  const primaryAccount = accountsWithResolvedAuthuser.find(
    (account) => account.authuser === undefined && account.isPrimary,
  );
  if (primaryAccount && availableAuthusers.includes(0)) {
    primaryAccount.authuser = 0;
    usedAuthusers.add(0);
    availableAuthusers.splice(availableAuthusers.indexOf(0), 1);
  }

  for (const account of accountsWithResolvedAuthuser) {
    if (account.authuser !== undefined) {
      continue;
    }

    const nextAuthuser = availableAuthusers.shift();
    if (nextAuthuser === undefined) {
      continue;
    }

    account.authuser = nextAuthuser;
  }

  return accountsWithResolvedAuthuser.flatMap((account) =>
    account.authuser === undefined
      ? []
      : [
          {
            ...account,
            authuser: account.authuser,
          },
        ],
  );
}

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
  const authuserPattern = /(?:[?&]authuser=|\/u\/)(\d+)/iu;
  const ignoredLabels = new Set([
    'manage your google account',
    'hide more accounts',
    'show more accounts',
    'add another account',
    'sign out of all accounts',
    'use another account',
    'google account',
  ]);
  const searchRoot = document.documentElement ?? document.body;

  function normalizeText(value: string | null | undefined): string {
    return (value ?? '').replace(/\s+/gu, ' ').trim();
  }

  function isPrimaryUiText(value: string): boolean {
    const normalizedValue = normalizeText(value).toLowerCase();
    return (
      normalizedValue === 'manage your google account' ||
      /^hi,\s*.+[!.]?$/iu.test(normalizedValue)
    );
  }

  function collectEmails(value: string): string[] {
    return Array.from(
      new Set(
        Array.from(value.matchAll(emailPattern), (match) => match[0].toLowerCase()),
      ),
    );
  }

  function extractAuthuserFromValue(value: string | null | undefined): number | null {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue) {
      return null;
    }

    const authuserMatch = authuserPattern.exec(normalizedValue);
    if (!authuserMatch) {
      return null;
    }

    const authuser = Number(authuserMatch[1]);
    return Number.isInteger(authuser) && authuser >= 0 ? authuser : null;
  }

  function hasPrimaryUiHint(textParts: string[]): boolean {
    return textParts.some((textPart) => isPrimaryUiText(textPart));
  }

  function extractAuthuserHintFromElement(accountContainer: Element): number | null {
    const candidateElements = [accountContainer, ...getDeepDescendantElements(accountContainer)];

    for (const candidateElement of candidateElements) {
      const directAuthuser =
        extractAuthuserFromValue(candidateElement.getAttribute('data-authuser')) ??
        extractAuthuserFromValue(candidateElement.getAttribute('data-auth-user'));
      if (directAuthuser !== null) {
        return directAuthuser;
      }

      for (const attribute of Array.from(candidateElement.attributes)) {
        const extractedAuthuser = extractAuthuserFromValue(attribute.value);
        if (extractedAuthuser !== null) {
          return extractedAuthuser;
        }
      }
    }

    return null;
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

  function getComposedParentElement(element: Element): Element | null {
    if (element.parentElement) {
      return element.parentElement;
    }

    const rootNode = element.getRootNode();
    return rootNode instanceof ShadowRoot ? rootNode.host : null;
  }

  function forEachDeepChildNode(rootNode: Node, visit: (node: Node) => void) {
    const pendingNodes = Array.from(rootNode.childNodes);

    while (pendingNodes.length > 0) {
      const currentNode = pendingNodes.shift();
      if (!currentNode) {
        continue;
      }

      visit(currentNode);

      if (currentNode instanceof Element && currentNode.shadowRoot) {
        pendingNodes.unshift(...Array.from(currentNode.shadowRoot.childNodes));
      }

      pendingNodes.unshift(...Array.from(currentNode.childNodes));
    }
  }

  function getDeepDescendantElements(rootElement: Element): Element[] {
    const descendantElements: Element[] = [];

    forEachDeepChildNode(rootElement, (node) => {
      if (node instanceof Element) {
        descendantElements.push(node);
      }
    });

    return descendantElements;
  }

  function findDeepImage(rootElement: Element): HTMLImageElement | null {
    if (rootElement instanceof HTMLImageElement) {
      return rootElement;
    }

    for (const descendantElement of getDeepDescendantElements(rootElement)) {
      if (descendantElement instanceof HTMLImageElement) {
        return descendantElement;
      }
    }

    return null;
  }

  function collectTextParts(container: Element): string[] {
    const textParts: string[] = [];

    forEachDeepChildNode(container, (node) => {
      if (node.nodeType !== Node.TEXT_NODE) {
        return;
      }

      const parentElement = node.parentElement;
      const normalizedText = normalizeText(node.textContent);

      if (parentElement && isVisibleElement(parentElement) && normalizedText) {
        if (textParts[textParts.length - 1] !== normalizedText) {
          textParts.push(normalizedText);
        }
      }
    });

    return textParts;
  }

  function findAccountContainer(startingElement: Element, email: string): Element | null {
    let currentElement: Element | null = startingElement;
    let fallbackElement: Element | null = startingElement;
    let bestElement: Element | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let depth = 0; currentElement && depth < 14; depth += 1) {
      if (!isVisibleElement(currentElement)) {
        currentElement = getComposedParentElement(currentElement);
        continue;
      }

      const textParts = collectTextParts(currentElement);
      const normalizedText = normalizeText(textParts.join(' '));
      const uniqueEmails = collectEmails(normalizedText);
      const hasAvatar = Boolean(findDeepImage(currentElement));
      const containsEmail = normalizedText.toLowerCase().includes(email.toLowerCase());
      const looksLikeCard =
        normalizedText.length <= 260 && textParts.length <= 8 && uniqueEmails.length <= 1;
      const hasPrimaryHint = hasPrimaryUiHint(textParts);
      const authuserHint = extractAuthuserHintFromElement(currentElement);

      if (containsEmail) {
        fallbackElement = currentElement;
      }

      if (containsEmail && (hasAvatar || looksLikeCard)) {
        fallbackElement = currentElement;
      }

      if (containsEmail) {
        let score = 0;
        score += uniqueEmails.length === 1 ? 4 : -uniqueEmails.length;
        score += hasAvatar ? 3 : 0;
        score += looksLikeCard ? 3 : 0;
        score += hasPrimaryHint ? 8 : 0;
        score += authuserHint !== null ? 10 : 0;
        score -= depth * 0.25;

        if (score > bestScore) {
          bestScore = score;
          bestElement = currentElement;
        }
      }

      currentElement = getComposedParentElement(currentElement);
    }

    return bestElement ?? fallbackElement;
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

  function findPrimaryAccountContainer(): Element | null {
    let bestElement: Element | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    forEachDeepChildNode(searchRoot, (node) => {
      if (node.nodeType !== Node.TEXT_NODE) {
        return;
      }

      const parentElement = node.parentElement;
      const normalizedText = normalizeText(node.textContent);
      if (!parentElement || !isVisibleElement(parentElement) || !isPrimaryUiText(normalizedText)) {
        return;
      }

      let currentElement: Element | null = parentElement;
      for (let depth = 0; currentElement && depth < 14; depth += 1) {
        if (!isVisibleElement(currentElement)) {
          currentElement = getComposedParentElement(currentElement);
          continue;
        }

        const textParts = collectTextParts(currentElement);
        const normalizedCardText = normalizeText(textParts.join(' '));
        const uniqueEmails = collectEmails(normalizedCardText);
        const hasAvatar = Boolean(findDeepImage(currentElement));
        const hasPrimaryHint = hasPrimaryUiHint(textParts);

        if (uniqueEmails.length !== 1 || !hasPrimaryHint) {
          currentElement = getComposedParentElement(currentElement);
          continue;
        }

        let score = 0;
        score += 20;
        score += hasAvatar ? 4 : 0;
        score += extractAuthuserHintFromElement(currentElement) !== null ? 8 : 0;
        score -= Math.max(uniqueEmails.length - 1, 0) * 4;
        score -= textParts.length > 16 ? textParts.length - 16 : 0;
        score -= depth * 0.25;

        if (score > bestScore) {
          bestScore = score;
          bestElement = currentElement;
        }

        currentElement = getComposedParentElement(currentElement);
      }
    });

    return bestElement;
  }

  function extractAuthuserFromContainer(accountContainer: Element): number | null {
    let currentElement: Element | null = accountContainer;

    for (let depth = 0; currentElement && depth < 10; depth += 1) {
      const authuserHint = extractAuthuserHintFromElement(currentElement);
      if (authuserHint !== null) {
        return authuserHint;
      }

      currentElement = getComposedParentElement(currentElement);
    }

    return null;
  }

  function isPrimaryAccountContainer(accountContainer: Element): boolean {
    let currentElement: Element | null = accountContainer;

    for (let depth = 0; currentElement && depth < 10; depth += 1) {
      if (hasPrimaryUiHint(collectTextParts(currentElement))) {
        return true;
      }

      currentElement = getComposedParentElement(currentElement);
    }

    return false;
  }

  const discoveredAccounts: ScrapedGoogleAccount[] = [];
  const seenEmails = new Set<string>();
  const deepTextEntries: Array<{parentElement: Element; normalizedText: string}> = [];

  const primaryAccountContainer = findPrimaryAccountContainer();
  if (primaryAccountContainer) {
    const primaryTextParts = collectTextParts(primaryAccountContainer);
    const primaryEmails = collectEmails(primaryTextParts.join(' '));
    const primaryEmail = primaryEmails[0];

    if (primaryEmail) {
      discoveredAccounts.push({
        email: primaryEmail,
        displayName: extractDisplayName(primaryTextParts, primaryEmail),
        avatarUrl: findDeepImage(primaryAccountContainer)?.getAttribute('src') ?? undefined,
        authuser: extractAuthuserFromContainer(primaryAccountContainer) ?? 0,
        isPrimary: true,
      });
      seenEmails.add(primaryEmail);
    }
  }

  forEachDeepChildNode(searchRoot, (node) => {
    if (node.nodeType !== Node.TEXT_NODE) {
      return;
    }

    const parentElement = node.parentElement;
    const normalizedText = normalizeText(node.textContent);

    if (!parentElement || !isVisibleElement(parentElement) || !normalizedText) {
      return;
    }

    deepTextEntries.push({parentElement, normalizedText});
  });

  for (const {parentElement, normalizedText} of deepTextEntries) {
    if (!parentElement || !isVisibleElement(parentElement) || !normalizedText) {
      continue;
    }

    const emailMatches = Array.from(normalizedText.matchAll(emailPattern));
    if (emailMatches.length === 0) {
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
      const avatarUrl = findDeepImage(accountContainer)?.getAttribute('src') ?? undefined;
      const authuser = extractAuthuserFromContainer(accountContainer);
      const isPrimary = isPrimaryAccountContainer(accountContainer);

      discoveredAccounts.push({
        email,
        displayName,
        avatarUrl: avatarUrl || undefined,
        authuser: authuser ?? undefined,
        isPrimary,
      });
      seenEmails.add(email);
    }
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
    normalizeScrapedAccounts(executionResult),
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
