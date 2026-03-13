export type ThemeMode = 'light' | 'dark';

export interface AppEntry {
  name: string;
  url: string;
  iconLetter: string;
  isCustom?: boolean;
}

export interface GoogleAccountProfile {
  authuser: number;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export interface PopupState {
  accountIndex: number;
  accountCount: number;
  customApps: AppEntry[];
  accountProfiles: GoogleAccountProfile[];
  accountsLastLoadedAt: string | null;
  theme: ThemeMode;
}

export interface CustomAppsBackupPayload {
  app: 'my-switcher';
  schemaVersion: 1;
  exportedAt: string;
  customApps: AppEntry[];
}

export const DEFAULT_POPUP_STATE: PopupState = {
  accountIndex: 0,
  accountCount: 5,
  customApps: [],
  accountProfiles: [],
  accountsLastLoadedAt: null,
  theme: 'light',
};
