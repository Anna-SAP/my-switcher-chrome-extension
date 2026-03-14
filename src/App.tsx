import {type ChangeEvent, type MouseEvent, useCallback, useEffect, useRef, useState} from 'react';
import {
  ChevronDown,
  Download,
  LoaderCircle,
  Moon,
  Plus,
  RefreshCw,
  Sun,
  Upload,
} from 'lucide-react';
import {
  createCustomAppsBackup,
  createCustomAppsBackupFileName,
  downloadCustomAppsBackup,
  parseCustomAppsBackup,
} from '@/lib/custom-app-backup';
import {aiApps, generalApps} from '@/data/apps';
import {
  ensureGoogleAccountsPermission,
  formatAccountsLastLoadedAt,
  formatGoogleAccountIdentityLabel,
  formatGoogleAccountOptionLabel,
  getGoogleAccountProfile,
  requestGoogleAccountsSync,
} from '@/lib/google-accounts';
import {loadPopupState, openAppTab, savePopupState} from '@/lib/popup-state';
import {buildAuthUrl, normalizeCustomUrl} from '@/lib/url';
import {DEFAULT_POPUP_STATE, type AppEntry, type GoogleAccountProfile, type PopupState} from '@/types/extension';

const customColors = ['#ea4335', '#34a853', '#fbbc05', '#4285f4', '#ff6d00', '#00bfa5'];

function AccountAvatar({
  profile,
  size = 24,
}: {
  profile?: GoogleAccountProfile;
  size?: number;
}) {
  const [imgError, setImgError] = useState(false);
  const avatarUrl = profile?.avatarUrl;
  const fallbackLetter = profile
    ? (profile.displayName || profile.email).charAt(0).toUpperCase()
    : '?';

  if (avatarUrl && !imgError) {
    return (
      <img
        className="account-avatar"
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <span
      className="account-avatar account-avatar-fallback"
      style={{width: size, height: size, fontSize: Math.round(size * 0.5)}}
    >
      {fallbackLetter}
    </span>
  );
}

function AccountDropdown({
  accountIndex,
  accountCount,
  accountProfiles,
  onChange,
}: {
  accountIndex: number;
  accountCount: number;
  accountProfiles: GoogleAccountProfile[];
  onChange: (index: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: Event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        closeDropdown();
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeDropdown();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, closeDropdown]);

  const selectedProfile = getGoogleAccountProfile(accountIndex, accountProfiles);
  const selectedLabel = formatGoogleAccountOptionLabel(accountIndex, accountProfiles);

  return (
    <div className={`account-dropdown ${isOpen ? 'open' : ''}`} ref={dropdownRef}>
      <button
        type="button"
        className="account-dropdown-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select Google account slot"
        title={selectedLabel}
      >
        <AccountAvatar profile={selectedProfile} size={24} />
        <span className="account-dropdown-label">{selectedLabel}</span>
        <ChevronDown size={14} className={`account-dropdown-chevron ${isOpen ? 'rotated' : ''}`} />
      </button>

      {isOpen && (
        <ul className="account-dropdown-menu" role="listbox" aria-activedescendant={`account-option-${accountIndex}`}>
          {Array.from({length: accountCount}, (_value, index) => {
            const profile = getGoogleAccountProfile(index, accountProfiles);
            const label = formatGoogleAccountOptionLabel(index, accountProfiles);
            const isSelected = index === accountIndex;

            return (
              <li
                key={index}
                id={`account-option-${index}`}
                role="option"
                aria-selected={isSelected}
                className={`account-dropdown-item ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                  onChange(index);
                  closeDropdown();
                }}
              >
                <AccountAvatar profile={profile} size={28} />
                <span className="account-dropdown-item-label">{label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AppSection({
  title,
  apps,
  onAppOpen,
  onCustomAppDelete,
}: {
  title: string;
  apps: AppEntry[];
  onAppOpen: (app: AppEntry) => void;
  onCustomAppDelete?: (event: MouseEvent<HTMLButtonElement>, index: number) => void;
}) {
  return (
    <section className="app-section">
      <div className="section-heading">{title}</div>
      <div className="app-grid">
        {apps.map((app, index) => {
          const colorIndex = app.name.charCodeAt(0) % customColors.length;
          const color = customColors[colorIndex];

          return (
            <button
              key={`${title}-${app.name}-${index}`}
              type="button"
              className="app-card"
              data-custom={app.isCustom ? 'true' : 'false'}
              title={app.isCustom ? `${app.name} - Right-click to remove` : app.name}
              onClick={() => onAppOpen(app)}
              onContextMenu={
                app.isCustom && onCustomAppDelete
                  ? (event) => onCustomAppDelete(event, index)
                  : undefined
              }
            >
              <span
                className="app-icon"
                style={
                  app.isCustom
                    ? {
                        backgroundColor: `${color}22`,
                        color,
                      }
                    : undefined
                }
              >
                {app.iconLetter}
              </span>
              <span className="app-name">{app.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function App() {
  const [popupState, setPopupState] = useState<PopupState>(DEFAULT_POPUP_STATE);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [formError, setFormError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [statusVariant, setStatusVariant] = useState<'default' | 'success' | 'error'>('default');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingAccounts, setIsSyncingAccounts] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isCancelled = false;

    void loadPopupState()
      .then((savedState) => {
        if (!isCancelled) {
          setPopupState(savedState);
        }
      })
      .catch((error) => {
        console.error('Failed to load popup state.', error);
        if (!isCancelled) {
          setStatusMessage('Extension sync storage is unavailable. Preview state will stay local.');
          setStatusVariant('error');
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = popupState.theme;
  }, [popupState.theme]);

  useEffect(() => {
    if (!statusMessage || statusVariant !== 'success') {
      return;
    }

    const timeoutId = globalThis.setTimeout(() => {
      setStatusMessage('');
      setStatusVariant('default');
    }, 3500);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [statusMessage, statusVariant]);

  async function persistState(
    patch: Partial<PopupState>,
    options?: {preserveStatusMessage?: boolean},
  ): Promise<boolean> {
    try {
      await savePopupState(patch);
      if (!options?.preserveStatusMessage) {
        setStatusMessage('');
        setStatusVariant('default');
      }
      return true;
    } catch (error) {
      console.error('Failed to persist popup state.', error);
      setStatusMessage('Failed to sync popup settings.');
      setStatusVariant('error');
      return false;
    }
  }

  function closeCustomForm() {
    setShowCustomForm(false);
    setCustomName('');
    setCustomUrl('');
    setFormError('');
  }

  async function handleOpenApp(app: AppEntry) {
    const targetUrl = buildAuthUrl(app.url, popupState.accountIndex);

    try {
      await openAppTab(targetUrl);
    } catch (error) {
      console.error('Failed to open target tab.', error);
      setStatusMessage('The browser blocked the new tab request.');
      setStatusVariant('error');
    }
  }

  async function handleAccountChange(nextAccountIndex: number) {
    setPopupState((currentState) => ({
      ...currentState,
      accountIndex: nextAccountIndex,
    }));

    await persistState({accountIndex: nextAccountIndex});
  }

  async function handleAddAccount() {
    const nextAccountCount = popupState.accountCount + 1;
    const nextAccountIndex = nextAccountCount - 1;

    setPopupState((currentState) => ({
      ...currentState,
      accountCount: nextAccountCount,
      accountIndex: nextAccountIndex,
    }));

    await persistState({
      accountCount: nextAccountCount,
      accountIndex: nextAccountIndex,
    });
  }

  async function handleSyncAccounts() {
    if (isSyncingAccounts) {
      return;
    }

    setIsSyncingAccounts(true);
    setStatusMessage('Syncing Google accounts...');
    setStatusVariant('default');

    try {
      const hasPermission = await ensureGoogleAccountsPermission();
      if (!hasPermission) {
        setStatusMessage('Grant Google Accounts access to load signed-in account names.');
        setStatusVariant('error');
        return;
      }

      const accountProfiles = await requestGoogleAccountsSync();
      const accountCount = Math.max(accountProfiles.length, 1);
      const accountIndex = Math.min(popupState.accountIndex, accountCount - 1);
      const accountsLastLoadedAt = new Date().toISOString();
      const nextStatePatch: Partial<PopupState> = {
        accountProfiles,
        accountCount,
        accountIndex,
        accountsLastLoadedAt,
      };

      const isPersisted = await persistState(nextStatePatch, {
        preserveStatusMessage: true,
      });
      if (!isPersisted) {
        return;
      }

      setPopupState((currentState) => ({
        ...currentState,
        accountProfiles,
        accountCount,
        accountIndex,
        accountsLastLoadedAt,
      }));
      setStatusMessage(
        `Synced ${accountProfiles.length} Google account${accountProfiles.length === 1 ? '' : 's'}.`,
      );
      setStatusVariant('success');
    } catch (error) {
      console.error('Failed to sync Google accounts.', error);
      setStatusMessage(
        error instanceof Error ? error.message : 'Failed to sync Google accounts.',
      );
      setStatusVariant('error');
    } finally {
      setIsSyncingAccounts(false);
    }
  }

  async function handleThemeToggle() {
    const nextTheme = popupState.theme === 'dark' ? 'light' : 'dark';

    setPopupState((currentState) => ({
      ...currentState,
      theme: nextTheme,
    }));

    await persistState({theme: nextTheme});
  }

  async function handleSaveCustomApp() {
    const trimmedName = customName.trim();
    const normalizedUrl = normalizeCustomUrl(customUrl);

    if (!trimmedName) {
      setFormError('App name is required.');
      return;
    }

    if (!normalizedUrl) {
      setFormError('Use a valid http(s) URL.');
      return;
    }

    const nextCustomApps = [
      ...popupState.customApps,
      {
        name: trimmedName,
        url: normalizedUrl,
        iconLetter: trimmedName.charAt(0).toUpperCase(),
        isCustom: true,
      },
    ];

    setPopupState((currentState) => ({
      ...currentState,
      customApps: nextCustomApps,
    }));

    closeCustomForm();
    await persistState({customApps: nextCustomApps});
  }

  async function handleExportCustomApps() {
    try {
      const backupContent = createCustomAppsBackup(popupState.customApps);
      await downloadCustomAppsBackup(createCustomAppsBackupFileName(), backupContent);

      setStatusMessage(
        popupState.customApps.length > 0
          ? `Exported ${popupState.customApps.length} custom apps.`
          : 'Exported an empty custom app backup.',
      );
      setStatusVariant('success');
    } catch (error) {
      console.error('Failed to export custom apps.', error);
      setStatusMessage(
        error instanceof Error ? error.message : 'Failed to export custom apps.',
      );
      setStatusVariant('error');
    }
  }

  function handleImportTrigger() {
    importInputRef.current?.click();
  }

  async function handleImportCustomApps(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';

    if (!selectedFile) {
      return;
    }

    try {
      const importedCustomApps = parseCustomAppsBackup(await selectedFile.text());

      if (
        popupState.customApps.length > 0 &&
        !window.confirm(
          `Importing "${selectedFile.name}" will replace your current ${popupState.customApps.length} custom apps. Continue?`,
        )
      ) {
        return;
      }

      closeCustomForm();
      setPopupState((currentState) => ({
        ...currentState,
        customApps: importedCustomApps,
      }));

      const isPersisted = await persistState(
        {customApps: importedCustomApps},
        {preserveStatusMessage: true},
      );
      if (!isPersisted) {
        return;
      }

      setStatusMessage(
        importedCustomApps.length > 0
          ? `Imported ${importedCustomApps.length} custom apps from ${selectedFile.name}.`
          : `Imported ${selectedFile.name}. Custom apps are now empty.`,
      );
      setStatusVariant('success');
    } catch (error) {
      console.error('Failed to import custom apps.', error);
      setStatusMessage(
        error instanceof Error ? error.message : 'Failed to import custom apps.',
      );
      setStatusVariant('error');
    }
  }

  async function handleDeleteCustomApp(
    event: MouseEvent<HTMLButtonElement>,
    index: number,
  ) {
    event.preventDefault();

    const targetApp = popupState.customApps[index];
    if (!targetApp) {
      return;
    }

    if (!window.confirm(`Delete custom app "${targetApp.name}"?`)) {
      return;
    }

    const nextCustomApps = popupState.customApps.filter(
      (_app, currentIndex) => currentIndex !== index,
    );

    setPopupState((currentState) => ({
      ...currentState,
      customApps: nextCustomApps,
    }));

    await persistState({customApps: nextCustomApps});
  }

  const isDarkMode = popupState.theme === 'dark';
  const hasLoadedAccounts = popupState.accountProfiles.length > 0;
  const syncButtonLabel = isSyncingAccounts
    ? 'Loading'
    : hasLoadedAccounts
      ? 'Refresh'
      : 'Load';
  const syncButtonTitle = hasLoadedAccounts
    ? 'Refresh signed-in Google account names and emails.'
    : 'Load signed-in Google account names and emails.';
  const selectedAccountProfile = getGoogleAccountProfile(
    popupState.accountIndex,
    popupState.accountProfiles,
  );
  const selectedAccountIdentityLabel = selectedAccountProfile
    ? formatGoogleAccountIdentityLabel(selectedAccountProfile)
    : null;
  const accountsLastLoadedLabel = formatAccountsLastLoadedAt(popupState.accountsLastLoadedAt);
  const accountSummary = selectedAccountIdentityLabel
    ? [selectedAccountIdentityLabel, accountsLastLoadedLabel ? `Synced ${accountsLastLoadedLabel}` : null]
        .filter(Boolean)
        .join(' | ')
    : popupState.accountsLastLoadedAt
      ? `Synced ${accountsLastLoadedLabel ?? 'recently'}. Load again to refresh account labels.`
      : 'Load Google account names and emails from your signed-in browser session.';

  return (
    <main className="popup-shell">
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="visually-hidden"
        onChange={(event) => void handleImportCustomApps(event)}
      />

      <header className="popup-header">
        <div className="header-row">
          <div className="title-block">
            <h1>My Switcher</h1>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => void handleThemeToggle()}
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        <div className="account-row">
          <AccountDropdown
            accountIndex={popupState.accountIndex}
            accountCount={popupState.accountCount}
            accountProfiles={popupState.accountProfiles}
            onChange={(index) => void handleAccountChange(index)}
          />

          <div className="account-actions">
            <button
              type="button"
              className="action-button sync-button"
              aria-label={isSyncingAccounts ? 'Syncing Google accounts' : 'Load signed-in Google accounts'}
              title={syncButtonTitle}
              onClick={() => void handleSyncAccounts()}
              disabled={isSyncingAccounts}
            >
              {isSyncingAccounts ? (
                <LoaderCircle size={16} className="spinning-icon" />
              ) : (
                <RefreshCw size={16} />
              )}
              {syncButtonLabel}
            </button>

            <button
              type="button"
              className="icon-button primary-button"
              aria-label="Add account slot"
              onClick={() => void handleAddAccount()}
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        <p className="account-summary">{accountSummary}</p>

        <div className="quick-actions">
          <button
            type="button"
            className="text-button utility-button"
            disabled={popupState.customApps.length === 0}
            onClick={() => void handleExportCustomApps()}
            title={
              popupState.customApps.length === 0
                ? 'Add a custom app before exporting.'
                : 'Export custom apps to a backup file.'
            }
          >
            <Download size={14} />
            Export
          </button>

          <button
            type="button"
            className="text-button utility-button"
            onClick={handleImportTrigger}
            title="Import custom apps from a backup file."
          >
            <Upload size={14} />
            Import
          </button>

          {!showCustomForm ? (
            <button
              type="button"
              className="text-button utility-button"
              onClick={() => setShowCustomForm(true)}
            >
              <Plus size={14} />
              Add app
            </button>
          ) : null}
        </div>

        {showCustomForm ? (
          <div className="form-panel">
            <input
              type="text"
              value={customName}
              placeholder="App Name (e.g. Colab)"
              onChange={(event) => setCustomName(event.target.value)}
            />
            <input
              type="url"
              value={customUrl}
              placeholder="URL (e.g. https://colab.research.google.com)"
              onChange={(event) => setCustomUrl(event.target.value)}
            />

            <div className="form-actions">
              <button type="button" className="text-button" onClick={closeCustomForm}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button action-button"
                onClick={() => void handleSaveCustomApp()}
              >
                Save
              </button>
            </div>

            {formError ? <p className="message error">{formError}</p> : null}
          </div>
        ) : null}

        {statusMessage ? <p className={`message ${statusVariant}`}>{statusMessage}</p> : null}
      </header>

      <div className="app-content">
        {isLoading ? <div className="status-line">Loading saved settings...</div> : null}

        <AppSection title="AI Apps" apps={aiApps} onAppOpen={(app) => void handleOpenApp(app)} />
        <AppSection
          title="General"
          apps={generalApps}
          onAppOpen={(app) => void handleOpenApp(app)}
        />

        {popupState.customApps.length > 0 ? (
          <AppSection
            title="Custom"
            apps={popupState.customApps}
            onAppOpen={(app) => void handleOpenApp(app)}
            onCustomAppDelete={(event, index) => void handleDeleteCustomApp(event, index)}
          />
        ) : null}
      </div>
    </main>
  );
}
