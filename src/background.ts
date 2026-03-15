import {sanitizeGoogleAccountProfiles, syncGoogleAccountsMessageType} from '@/lib/google-accounts';

const listAccountsUrl =
  'https://accounts.google.com/ListAccounts?gpsia=1&source=ogb&mo=1&hl=en';
const tabLoadTimeoutMs = 15000;

type RuntimeMessage = {
  type?: string;
};

type GoogleAccountProfile = {
  authuser: number;
  email: string;
  displayName: string;
  avatarUrl?: string;
};

// Access native browser APIs directly (not through the abstraction layer)
// because we need features like scripting.executeScript with world: 'MAIN'
const chromeApi = (globalThis as any).chrome ?? (globalThis as any).browser;

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      chromeApi.tabs.onUpdated.removeListener(handleUpdated);
      reject(new Error('Timed out while loading the Google page.'));
    }, tabLoadTimeoutMs);

    function handleUpdated(updatedTabId: number, changeInfo: {status?: string}) {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
        return;
      }
      globalThis.clearTimeout(timeoutId);
      chromeApi.tabs.onUpdated.removeListener(handleUpdated);
      resolve();
    }

    chromeApi.tabs.onUpdated.addListener(handleUpdated);
  });
}

// This function runs in the Google page's MAIN world context.
// It has full access to the page's cookies via fetch credentials.
async function fetchListAccountsInPageContext(url: string): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`ListAccounts request failed: ${response.status}`);
  }
  return response.text();
}

function parseListAccountsResponse(responseText: string): GoogleAccountProfile[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(responseText);
  } catch {
    const firstBracket = responseText.indexOf('[');
    const lastBracket = responseText.lastIndexOf(']');
    if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
      return [];
    }

    try {
      parsed = JSON.parse(responseText.slice(firstBracket, lastBracket + 1));
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const accountList = findAccountArray(parsed);
  if (!accountList) {
    return [];
  }

  const accounts: GoogleAccountProfile[] = [];

  for (let index = 0; index < accountList.length; index += 1) {
    const entry = accountList[index];
    if (!Array.isArray(entry)) {
      continue;
    }

    const email = findEmailInEntry(entry);
    if (!email) {
      continue;
    }

    const displayName = findDisplayNameInEntry(entry, email);
    const avatarUrl = findAvatarInEntry(entry);

    accounts.push({
      authuser: index,
      email,
      displayName,
      avatarUrl: avatarUrl || undefined,
    });
  }

  return accounts;
}

function findAccountArray(parsed: unknown[]): unknown[][] | null {
  for (const element of parsed) {
    if (
      Array.isArray(element) &&
      element.length > 0 &&
      element.every((item) => Array.isArray(item))
    ) {
      return element as unknown[][];
    }
  }

  if (
    parsed.length > 0 &&
    parsed.every(
      (item) => Array.isArray(item) && item.length >= 4 && typeof item[0] === 'string',
    )
  ) {
    return parsed as unknown[][];
  }

  return null;
}

function findEmailInEntry(entry: unknown[]): string | null {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

  if (typeof entry[3] === 'string' && emailPattern.test(entry[3])) {
    return entry[3].trim().toLowerCase();
  }

  for (const field of entry) {
    if (typeof field === 'string' && emailPattern.test(field)) {
      return field.trim().toLowerCase();
    }
  }

  return null;
}

function findDisplayNameInEntry(entry: unknown[], email: string): string {
  if (typeof entry[2] === 'string' && entry[2].trim() && !entry[2].includes('@')) {
    return entry[2].trim();
  }

  for (const field of entry) {
    if (
      typeof field === 'string' &&
      field.trim() &&
      !field.includes('@') &&
      !field.startsWith('//') &&
      !field.startsWith('http') &&
      field !== 'gaia.l.a' &&
      field !== 'gaia.l.a.r'
    ) {
      return field.trim();
    }
  }

  return email;
}

function findAvatarInEntry(entry: unknown[]): string | undefined {
  for (const field of entry) {
    if (typeof field !== 'string') {
      continue;
    }

    const trimmed = field.trim();
    if (
      trimmed.startsWith('//') &&
      (trimmed.includes('googleusercontent.com') || trimmed.includes('google.com'))
    ) {
      return `https:${trimmed}`;
    }

    if (
      trimmed.startsWith('https://') &&
      (trimmed.includes('googleusercontent.com') || trimmed.includes('google.com')) &&
      (trimmed.includes('/photo') || trimmed.includes('/avatar') || trimmed.includes('lh3'))
    ) {
      return trimmed;
    }
  }

  return undefined;
}

async function loadGoogleAccounts(): Promise<GoogleAccountProfile[]> {
  // Step 1: Open a lightweight Google page (favicon loads fast, stays on www.google.com)
  const tab = await new Promise<{id?: number}>((resolve, reject) => {
    chromeApi.tabs.create(
      {url: 'https://www.google.com/favicon.ico', active: false},
      (createdTab: {id?: number}) => {
        if (chromeApi.runtime.lastError) {
          reject(new Error(chromeApi.runtime.lastError.message));
          return;
        }
        resolve(createdTab);
      },
    );
  });

  const tabId = tab?.id;
  if (typeof tabId !== 'number') {
    throw new Error('Failed to create tab.');
  }

  try {
    // Step 2: Wait for the page to finish loading
    await waitForTabLoad(tabId);

    // Step 3: Execute fetch in the page's MAIN world.
    // Because the script runs in www.google.com's context,
    // fetch to accounts.google.com will include .google.com cookies automatically.
    const results = await new Promise<Array<{result?: unknown}>>((resolve, reject) => {
      chromeApi.scripting.executeScript(
        {
          target: {tabId},
          world: 'MAIN',
          func: fetchListAccountsInPageContext,
          args: [listAccountsUrl],
        },
        (injectionResults: Array<{result?: unknown}>) => {
          if (chromeApi.runtime.lastError) {
            reject(new Error(chromeApi.runtime.lastError.message));
            return;
          }
          resolve(injectionResults ?? []);
        },
      );
    });

    const responseText = results[0]?.result;
    if (typeof responseText !== 'string' || !responseText.trim()) {
      throw new Error('Please sign in to a Google account first.');
    }

    const accounts = parseListAccountsResponse(responseText);
    if (accounts.length === 0) {
      throw new Error('Please sign in to a Google account first.');
    }

    return sanitizeGoogleAccountProfiles(accounts);
  } finally {
    // Step 4: Clean up the helper tab
    chromeApi.tabs.remove(tabId, () => {
      void chromeApi.runtime.lastError; // suppress error
    });
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

chromeApi?.runtime?.onMessage?.addListener?.(handleRuntimeMessage);
