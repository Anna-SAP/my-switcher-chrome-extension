import {browserApi} from '@/lib/webextension';
import type {GoogleAccountProfile} from '@/types/extension';

export const googleAccountsPermissionOrigins = ['https://accounts.google.com/*'];
export const syncGoogleAccountsMessageType = 'syncGoogleAccounts';

interface SyncGoogleAccountsResponse {
  accounts?: unknown;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizeDisplayName(displayName: string, email: string): string {
  const trimmedDisplayName = displayName.trim();
  if (!trimmedDisplayName) {
    return email;
  }

  return trimmedDisplayName;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email);
}

export function sanitizeGoogleAccountProfiles(value: unknown): GoogleAccountProfile[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const accountProfiles = value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const authuser = Number(entry.authuser);
    const email = typeof entry.email === 'string' ? entry.email.trim() : '';
    const displayName = typeof entry.displayName === 'string' ? entry.displayName : '';
    const avatarUrl = typeof entry.avatarUrl === 'string' ? entry.avatarUrl.trim() : '';

    if (!Number.isInteger(authuser) || authuser < 0 || !isValidEmail(email)) {
      return [];
    }

    return [
      {
        authuser,
        email,
        displayName: sanitizeDisplayName(displayName, email),
        avatarUrl: avatarUrl || undefined,
      },
    ];
  });

  return accountProfiles.sort((leftAccount, rightAccount) => leftAccount.authuser - rightAccount.authuser);
}

export function getGoogleAccountProfile(
  authuser: number,
  accountProfiles: GoogleAccountProfile[],
): GoogleAccountProfile | undefined {
  return accountProfiles.find((accountProfile) => accountProfile.authuser === authuser);
}

export function formatGoogleAccountIdentityLabel(accountProfile: GoogleAccountProfile): string {
  return accountProfile.displayName && accountProfile.displayName !== accountProfile.email
    ? `${accountProfile.displayName} <${accountProfile.email}>`
    : accountProfile.email;
}

export function formatGoogleAccountOptionLabel(
  authuser: number,
  accountProfiles: GoogleAccountProfile[],
): string {
  const accountProfile = getGoogleAccountProfile(authuser, accountProfiles);
  if (!accountProfile) {
    return authuser === 0 ? 'Account 0 (Default u/0)' : `Account ${authuser} (u/${authuser})`;
  }

  return `${formatGoogleAccountIdentityLabel(accountProfile)} (u/${authuser})`;
}

export function formatAccountsLastLoadedAt(accountsLastLoadedAt: string | null): string | null {
  if (!accountsLastLoadedAt) {
    return null;
  }

  const parsedDate = Date.parse(accountsLastLoadedAt);
  if (Number.isNaN(parsedDate)) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(parsedDate));
}

export async function ensureGoogleAccountsPermission(): Promise<boolean> {
  if (!browserApi?.permissions?.contains || !browserApi?.permissions?.request) {
    throw new Error('Account sync is only available inside the installed extension.');
  }

  const hasPermission = await browserApi.permissions.contains({
    origins: googleAccountsPermissionOrigins,
  });
  if (hasPermission) {
    return true;
  }

  return browserApi.permissions.request({
    origins: googleAccountsPermissionOrigins,
  });
}

export async function requestGoogleAccountsSync(): Promise<GoogleAccountProfile[]> {
  if (!browserApi?.runtime?.sendMessage) {
    throw new Error('Account sync is only available inside the installed extension.');
  }

  const response = (await browserApi.runtime.sendMessage({
    type: syncGoogleAccountsMessageType,
  })) as SyncGoogleAccountsResponse | undefined;

  if (!isRecord(response)) {
    throw new Error('Failed to load Google accounts.');
  }

  if (typeof response.error === 'string' && response.error.trim()) {
    throw new Error(response.error);
  }

  const accountProfiles = sanitizeGoogleAccountProfiles(response.accounts);
  if (accountProfiles.length === 0) {
    throw new Error('Please sign in to a Google account first.');
  }

  return accountProfiles;
}
