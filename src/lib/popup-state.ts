import {DEFAULT_POPUP_STATE, type AppEntry, type PopupState} from '@/types/extension';
import {normalizeCustomUrl} from '@/lib/url';
import {browserApi} from '@/lib/webextension';

const localStorageKey = 'my-switcher-popup-state';
const syncKeys = ['accountIndex', 'accountCount', 'customApps', 'theme'];

function parseAccountCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_POPUP_STATE.accountCount;
}

function parseAccountIndex(value: unknown, accountCount: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return DEFAULT_POPUP_STATE.accountIndex;
  }

  return Math.min(parsed, accountCount - 1);
}

function parseCustomApps(value: unknown): AppEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }

    const candidate = entry as Record<string, unknown>;
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    const url = typeof candidate.url === 'string' ? normalizeCustomUrl(candidate.url) : null;
    if (!name || !url) {
      return [];
    }

    const iconLetter =
      typeof candidate.iconLetter === 'string' && candidate.iconLetter.trim()
        ? candidate.iconLetter.trim().charAt(0).toUpperCase()
        : name.charAt(0).toUpperCase();

    return [
      {
        name,
        url,
        iconLetter,
        isCustom: true,
      },
    ];
  });
}

function sanitizePopupState(rawState: Record<string, unknown>): PopupState {
  const accountCount = parseAccountCount(rawState.accountCount);

  return {
    accountIndex: parseAccountIndex(rawState.accountIndex, accountCount),
    accountCount,
    customApps: parseCustomApps(rawState.customApps),
    theme: rawState.theme === 'dark' ? 'dark' : 'light',
  };
}

function readLocalState(): Record<string, unknown> {
  const rawValue = globalThis.localStorage?.getItem(localStorageKey);
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalState(patch: Partial<PopupState>) {
  const nextState = {
    ...readLocalState(),
    ...patch,
  };

  globalThis.localStorage?.setItem(localStorageKey, JSON.stringify(nextState));
}

export async function loadPopupState(): Promise<PopupState> {
  if (browserApi) {
    try {
      const syncedState = await browserApi.storage.sync.get(syncKeys);
      return sanitizePopupState(syncedState);
    } catch (error) {
      console.error('Falling back to local popup state.', error);
    }
  }

  return sanitizePopupState(readLocalState());
}

export async function savePopupState(patch: Partial<PopupState>): Promise<void> {
  if (browserApi) {
    try {
      await browserApi.storage.sync.set(patch);
      return;
    } catch (error) {
      console.error('Firefox sync storage write failed, using local storage.', error);
    }
  }

  writeLocalState(patch);
}

export async function openAppTab(url: string): Promise<void> {
  if (browserApi) {
    await browserApi.tabs.create({url});
    return;
  }

  globalThis.open(url, '_blank', 'noopener,noreferrer');
}