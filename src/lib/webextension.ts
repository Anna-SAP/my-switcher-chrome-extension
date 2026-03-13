type BrowserApi = {
  storage: {
    sync: {
      get(keys: string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
  tabs: {
    create(createProperties: {url: string}): Promise<unknown>;
  };
  runtime?: {
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
    },
    tabs: {
      create(createProperties) {
        return callbackToPromise<unknown>((resolve) => {
          chromeApi.tabs.create(createProperties, resolve);
        });
      },
    },
    runtime: chromeApi.runtime,
  };
}

export const browserApi: BrowserApi | null = (() => {
  const nativeBrowser = (globalThis as {browser?: BrowserApi}).browser;
  if (nativeBrowser?.storage?.sync && nativeBrowser?.tabs) {
    return nativeBrowser;
  }

  const chromeApi = (globalThis as {chrome?: any}).chrome;
  if (chromeApi?.storage?.sync && chromeApi?.tabs) {
    return createChromeAdapter(chromeApi);
  }

  return null;
})();