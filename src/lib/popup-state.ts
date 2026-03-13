import {DEFAULT_POPUP_STATE, type AppEntry, type PopupState} from '@/types/extension';
import {sanitizeGoogleAccountProfiles} from '@/lib/google-accounts';
import {normalizeCustomUrl} from '@/lib/url';
import {browserApi} from '@/lib/webextension';

const localStorageKey = 'my-switcher-popup-state';
const syncKeys = ['accountIndex', 'accountCount', 'customApps', 'theme'];
const localKeys = ['accountProfiles', 'accountsLastLoadedAt'];

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

export function sanitizeCustomApps(value: unknown): AppEntry[] {
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
  const accountProfiles = sanitizeGoogleAccountProfiles(rawState.accountProfiles);
  const accountCount = Math.max(parseAccountCount(rawState.accountCount), accountProfiles.length, 1);
  const accountsLastLoadedAt =
    typeof rawState.accountsLastLoadedAt === 'string' &&
    !Number.isNaN(Date.parse(rawState.accountsLastLoadedAt))
      ? new Date(rawState.accountsLastLoadedAt).toISOString()
      : null;

  return {
    accountIndex: parseAccountIndex(rawState.accountIndex, accountCount),
    accountCount,
    customApps: sanitizeCustomApps(rawState.customApps),
    accountProfiles,
    accountsLastLoadedAt,
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
      const [syncedState, localState] = await Promise.all([
        browserApi.storage.sync.get(syncKeys),
        browserApi.storage.local.get(localKeys),
      ]);
      return sanitizePopupState({
        ...syncedState,
        ...localState,
      });
    } catch (error) {
      console.error('Extension sync storage read failed, falling back to local popup state.', error);
    }
  }

  return sanitizePopupState(readLocalState());
}

export async function savePopupState(patch: Partial<PopupState>): Promise<void> {
  const syncPatch = Object.fromEntries(
    Object.entries(patch).filter(([key]) => syncKeys.includes(key)),
  );
  const localPatch = Object.fromEntries(
    Object.entries(patch).filter(([key]) => localKeys.includes(key)),
  );

  if (browserApi) {
    try {
      if (Object.keys(syncPatch).length > 0) {
        await browserApi.storage.sync.set(syncPatch);
      }

      if (Object.keys(localPatch).length > 0) {
        await browserApi.storage.local.set(localPatch);
      }

      return;
    } catch (error) {
      console.error('Extension sync storage write failed, using local storage.', error);
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
