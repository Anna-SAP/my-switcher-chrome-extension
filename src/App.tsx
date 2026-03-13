import {type ChangeEvent, type MouseEvent, useEffect, useRef, useState} from 'react';
import {Download, Moon, Plus, Sun, Upload} from 'lucide-react';
import {
  createCustomAppsBackup,
  createCustomAppsBackupFileName,
  downloadCustomAppsBackup,
  parseCustomAppsBackup,
} from '@/lib/custom-app-backup';
import {aiApps, generalApps} from '@/data/apps';
import {loadPopupState, openAppTab, savePopupState} from '@/lib/popup-state';
import {buildAuthUrl, normalizeCustomUrl} from '@/lib/url';
import {DEFAULT_POPUP_STATE, type AppEntry, type PopupState} from '@/types/extension';

const customColors = ['#ea4335', '#34a853', '#fbbc05', '#4285f4', '#ff6d00', '#00bfa5'];

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

  async function handleAccountChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextAccountIndex = Number.parseInt(event.target.value, 10);

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
          <select
            className="account-select"
            value={popupState.accountIndex}
            onChange={(event) => void handleAccountChange(event)}
            aria-label="Select Google account slot"
          >
            {Array.from({length: popupState.accountCount}, (_value, index) => (
              <option key={index} value={index}>
                {index === 0 ? 'Account 0 (Default u/0)' : `Account ${index} (u/${index})`}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="icon-button primary-button"
            aria-label="Add account slot"
            onClick={() => void handleAddAccount()}
          >
            <Plus size={18} />
          </button>
        </div>

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
