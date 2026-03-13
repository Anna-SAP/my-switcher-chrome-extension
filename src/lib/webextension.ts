type StorageArea = {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

type PermissionDetails = {
  origins?: string[];
  permissions?: string[];
};

type ExtensionTab = {
  id?: number;
};

type BrowserApi = {
  storage: {
    sync: StorageArea;
    local: StorageArea;
  };
  tabs: {
    create(createProperties: {url: string; active?: boolean}): Promise<ExtensionTab>;
    remove(tabIds: number | number[]): Promise<void>;
  };
  scripting?: {
    executeScript(injection: {
      target: {
        tabId: number;
      };
      func: (...args: any[]) => unknown;
      args?: unknown[];
    }): Promise<Array<{result: unknown}>>;
  };
  permissions?: {
    contains(details: PermissionDetails): Promise<boolean>;
    request(details: PermissionDetails): Promise<boolean>;
  };
  runtime?: {
    sendMessage?(message: unknown): Promise<unknown>;
    lastError?: {
      message?: string;
    };
  };
};

function createChromeAdapter(chromeApi: any): BrowserApi {
  function callbackToPromise<T>(executor: (resolve: (value: T) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      executor((value) => {
        const runtimeError = chromeApi.runtime?.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message ?? 'Unknown Chrome runtime error.'));
          return;
        }

        resolve(value);
      });
    });
  }

  return {
    storage: {
      sync: {
        get(keys) {
          return callbackToPromise<Record<string, unknown>>((resolve) => {
            chromeApi.storage.sync.get(keys, resolve);
          });
        },
        set(items) {
          return callbackToPromise<void>((resolve) => {
            chromeApi.storage.sync.set(items, () => resolve());
          });
        },
      },
      local: {
        get(keys) {
          return callbackToPromise<Record<string, unknown>>((resolve) => {
            chromeApi.storage.local.get(keys, resolve);
          });
        },
        set(items) {
          return callbackToPromise<void>((resolve) => {
            chromeApi.storage.local.set(items, () => resolve());
          });
        },
      },
    },
    tabs: {
      create(createProperties) {
        return callbackToPromise<ExtensionTab>((resolve) => {
          chromeApi.tabs.create(createProperties, resolve);
        });
      },
      remove(tabIds) {
        return callbackToPromise<void>((resolve) => {
          chromeApi.tabs.remove(tabIds, () => resolve());
        });
      },
    },
    scripting: chromeApi.scripting
      ? {
          executeScript(injection) {
            return callbackToPromise<Array<{result: unknown}>>((resolve) => {
              chromeApi.scripting.executeScript(injection, resolve);
            });
          },
        }
      : undefined,
    permissions: chromeApi.permissions
      ? {
          contains(details) {
            return callbackToPromise<boolean>((resolve) => {
              chromeApi.permissions.contains(details, resolve);
            });
          },
          request(details) {
            return callbackToPromise<boolean>((resolve) => {
              chromeApi.permissions.request(details, resolve);
            });
          },
        }
      : undefined,
    runtime: chromeApi.runtime
      ? {
          lastError: chromeApi.runtime.lastError,
          sendMessage(message) {
            return callbackToPromise<unknown>((resolve) => {
              chromeApi.runtime.sendMessage(message, resolve);
            });
          },
        }
      : undefined,
  };
}

export const browserApi: BrowserApi | null = (() => {
  const nativeBrowser = (globalThis as {browser?: BrowserApi}).browser;
  if (
    nativeBrowser?.storage?.sync &&
    nativeBrowser?.storage?.local &&
    nativeBrowser?.tabs
  ) {
    return nativeBrowser;
  }

  const chromeApi = (globalThis as {chrome?: any}).chrome;
  if (chromeApi?.storage?.sync && chromeApi?.storage?.local && chromeApi?.tabs) {
    return createChromeAdapter(chromeApi);
  }

  return null;
})();
