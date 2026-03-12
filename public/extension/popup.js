document.addEventListener('DOMContentLoaded', async () => {
  const aiApps = [
    { name: 'AI Studio', url: 'https://aistudio.google.com', iconLetter: 'A' },
    { name: 'Gemini', url: 'https://gemini.google.com', iconLetter: 'G' },
    { name: 'Studio Apps', url: 'https://aistudio.google.com/apps', iconLetter: 'S' },
    { name: 'NotebookLM', url: 'https://notebooklm.google.com', iconLetter: 'N' }
  ];

  const generalApps = [
    { name: 'Gmail', url: 'https://mail.google.com', iconLetter: 'G' },
    { name: 'Drive', url: 'https://drive.google.com', iconLetter: 'D' },
    { name: 'Docs', url: 'https://docs.google.com', iconLetter: 'D' },
    { name: 'Sheets', url: 'https://docs.google.com/spreadsheets', iconLetter: 'S' },
    { name: 'Meet', url: 'https://meet.google.com', iconLetter: 'M' },
    { name: 'Calendar', url: 'https://calendar.google.com', iconLetter: 'C' },
    { name: 'Slides', url: 'https://docs.google.com/presentation', iconLetter: 'S' },
    { name: 'Sites', url: 'https://sites.google.com', iconLetter: 'S' },
    { name: 'Forms', url: 'https://docs.google.com/forms', iconLetter: 'F' },
    { name: 'YouTube', url: 'https://www.youtube.com', iconLetter: 'Y' },
    { name: 'Translate', url: 'https://translate.google.com', iconLetter: 'T' },
    { name: 'Tasks', url: 'https://tasksboard.com', iconLetter: 'T' },
    { name: 'Photos', url: 'https://photos.google.com', iconLetter: 'P' },
    { name: 'Keep', url: 'https://keep.google.com', iconLetter: 'K' }
  ];

  let customApps = [];
  let currentAccountIndex = 0;
  let accountCount = 5;
  let isDarkMode = false;

  // DOM Elements
  const aiAppGrid = document.getElementById('ai-app-grid');
  const generalAppGrid = document.getElementById('general-app-grid');
  const customAppGrid = document.getElementById('custom-app-grid');
  const customAppsSection = document.getElementById('custom-apps-section');
  const accountSelect = document.getElementById('account-select');
  const addAccountBtn = document.getElementById('add-account-btn');
  const themeToggle = document.getElementById('theme-toggle');
  const addCustomAppBtn = document.getElementById('add-custom-app-btn');
  const customAppForm = document.getElementById('custom-app-form');
  const saveCustomAppBtn = document.getElementById('save-custom-app');
  const cancelCustomAppBtn = document.getElementById('cancel-custom-app');
  const customAppNameInput = document.getElementById('custom-app-name');
  const customAppUrlInput = document.getElementById('custom-app-url');

  function renderAccounts() {
    accountSelect.innerHTML = '';
    for (let i = 0; i < accountCount; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = i === 0 ? 'Account 0 (Default u/0)' : `Account ${i} (u/${i})`;
      accountSelect.appendChild(option);
    }
    accountSelect.value = currentAccountIndex;
  }

  // Load state from storage
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.sync.get(['accountIndex', 'accountCount', 'customApps', 'theme'], (result) => {
      if (result.accountCount !== undefined) {
        accountCount = result.accountCount;
      }
      if (result.accountIndex !== undefined) {
        currentAccountIndex = result.accountIndex;
      }
      if (result.customApps) {
        customApps = result.customApps;
      }
      if (result.theme === 'dark') {
        isDarkMode = true;
        document.body.setAttribute('data-theme', 'dark');
      }
      renderAccounts();
      renderApps();
    });
  } else {
    // Fallback for local testing
    renderAccounts();
    renderApps();
  }

  // Account selection change
  accountSelect.addEventListener('change', (e) => {
    currentAccountIndex = e.target.value;
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set({ accountIndex: currentAccountIndex });
    }
  });

  // Add Account to List
  addAccountBtn.addEventListener('click', () => {
    accountCount++;
    currentAccountIndex = accountCount - 1; // Auto-select the new account
    
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set({ accountCount, accountIndex: currentAccountIndex }, () => {
        renderAccounts();
      });
    } else {
      renderAccounts();
    }
  });

  // Theme toggle
  themeToggle.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    if (isDarkMode) {
      document.body.setAttribute('data-theme', 'dark');
    } else {
      document.body.removeAttribute('data-theme');
    }
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set({ theme: isDarkMode ? 'dark' : 'light' });
    }
  });

  // Custom App Form Toggle
  addCustomAppBtn.addEventListener('click', () => {
    addCustomAppBtn.classList.add('hidden');
    customAppForm.classList.remove('hidden');
  });

  cancelCustomAppBtn.addEventListener('click', () => {
    customAppForm.classList.add('hidden');
    addCustomAppBtn.classList.remove('hidden');
    customAppNameInput.value = '';
    customAppUrlInput.value = '';
  });

  // Save Custom App
  saveCustomAppBtn.addEventListener('click', () => {
    const name = customAppNameInput.value.trim();
    let url = customAppUrlInput.value.trim();

    if (name && url) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      
      const newApp = {
        name,
        url,
        iconLetter: name.charAt(0).toUpperCase(),
        isCustom: true
      };

      customApps.push(newApp);
      
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.sync.set({ customApps }, () => {
          renderApps();
          cancelCustomAppBtn.click();
        });
      } else {
        renderApps();
        cancelCustomAppBtn.click();
      }
    }
  });

  // URL Modifier Logic
  function getAuthUrl(baseUrl, accountIndex) {
    try {
      const urlObj = new URL(baseUrl);
      // For most Google services, appending ?authuser=X works.
      urlObj.searchParams.set('authuser', accountIndex);
      return urlObj.toString();
    } catch (e) {
      return baseUrl;
    }
  }

  // Render Apps
  function renderAppGrid(apps, container, isCustom = false) {
    container.innerHTML = '';
    
    apps.forEach((app, index) => {
      const card = document.createElement('div');
      card.className = 'app-card';
      
      const icon = document.createElement('div');
      icon.className = 'app-icon';
      icon.textContent = app.iconLetter;
      
      // Generate a random color for custom apps based on name
      if (app.isCustom) {
        const colors = ['#ea4335', '#34a853', '#fbbc05', '#4285f4', '#ff6d00', '#00bfa5'];
        const colorIndex = app.name.charCodeAt(0) % colors.length;
        icon.style.backgroundColor = colors[colorIndex] + '33'; // 20% opacity
        icon.style.color = colors[colorIndex];
      }

      const name = document.createElement('div');
      name.className = 'app-name';
      name.textContent = app.name;
      name.title = app.name;

      card.appendChild(icon);
      card.appendChild(name);

      card.addEventListener('click', () => {
        const targetUrl = getAuthUrl(app.url, currentAccountIndex);
        if (typeof chrome !== 'undefined' && chrome.tabs) {
          chrome.tabs.create({ url: targetUrl });
        } else {
          window.open(targetUrl, '_blank');
        }
      });

      // Add delete button for custom apps on right click
      if (app.isCustom) {
        card.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (confirm(`Delete custom app "${app.name}"?`)) {
            customApps.splice(index, 1);
            if (typeof chrome !== 'undefined' && chrome.storage) {
              chrome.storage.sync.set({ customApps }, renderApps);
            } else {
              renderApps();
            }
          }
        });
      }

      container.appendChild(card);
    });
  }

  function renderApps() {
    renderAppGrid(aiApps, aiAppGrid);
    renderAppGrid(generalApps, generalAppGrid);
    
    if (customApps.length > 0) {
      customAppsSection.classList.remove('hidden');
      renderAppGrid(customApps, customAppGrid, true);
    } else {
      customAppsSection.classList.add('hidden');
    }
  }
});
