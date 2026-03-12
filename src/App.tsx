/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Moon, Sun, Plus, Download } from 'lucide-react';
import JSZip from 'jszip';

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

const colors = ['#ea4335', '#34a853', '#fbbc05', '#4285f4', '#ff6d00', '#00bfa5'];

export default function App() {
  const [accountIndex, setAccountIndex] = useState('0');
  const [accountCount, setAccountCount] = useState(5);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [customApps, setCustomApps] = useState<{name: string, url: string, iconLetter: string, isCustom: boolean}[]>([]);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [isZipping, setIsZipping] = useState(false);

  const handleAppClick = (baseUrl: string) => {
    try {
      const urlObj = new URL(baseUrl);
      urlObj.searchParams.set('authuser', accountIndex);
      window.open(urlObj.toString(), '_blank');
    } catch (e) {
      window.open(baseUrl, '_blank');
    }
  };

  const handleAddCustomApp = () => {
    if (customName && customUrl) {
      let url = customUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      setCustomApps([...customApps, {
        name: customName.trim(),
        url,
        iconLetter: customName.trim().charAt(0).toUpperCase(),
        isCustom: true
      }]);
      setCustomName('');
      setCustomUrl('');
      setShowCustomForm(false);
    }
  };

  const handleDeleteCustomApp = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    if (window.confirm(`Delete custom app "${customApps[index].name}"?`)) {
      const newApps = [...customApps];
      newApps.splice(index, 1);
      setCustomApps(newApps);
    }
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const files = ['manifest.json', 'popup.html', 'styles.css', 'popup.js', 'icon-16.png', 'icon-48.png', 'icon-128.png'];

      for (const file of files) {
        const response = await fetch(`/extension/${file}`);
        if (response.ok) {
          if (file.endsWith('.png')) {
            const blob = await response.blob();
            zip.file(file, blob);
          } else {
            const content = await response.text();
            zip.file(file, content);
          }
        }
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-switcher-extension.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to generate zip', error);
      alert('Failed to generate ZIP file.');
    } finally {
      setIsZipping(false);
    }
  };

  const renderAppGrid = (apps: any[], isCustomSection = false) => (
    <div className="grid grid-cols-3 gap-3 p-4 pt-2">
      {apps.map((app, idx) => {
        const isCustom = app.isCustom;
        const colorIndex = app.name.charCodeAt(0) % colors.length;
        const customColor = colors[colorIndex];

        return (
          <button
            key={idx}
            onClick={() => handleAppClick(app.url)}
            onContextMenu={(e) => isCustom ? handleDeleteCustomApp(e, idx) : undefined}
            className="flex flex-col items-center justify-center p-3 bg-white dark:bg-[#2d2e30] border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 hover:-translate-y-0.5 hover:shadow-md transition-all group"
          >
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold mb-2"
              style={{
                backgroundColor: isCustom ? `${customColor}33` : (isDarkMode ? '#3c4043' : '#e8f0fe'),
                color: isCustom ? customColor : (isDarkMode ? '#8ab4f8' : '#1a73e8')
              }}
            >
              {app.iconLetter}
            </div>
            <div className="text-xs text-center w-full truncate text-gray-900 dark:text-gray-100">
              {app.name}
            </div>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={`min-h-screen flex items-center justify-center bg-gray-100 ${isDarkMode ? 'dark' : ''} py-8`}>
      <div className="w-[320px] bg-white dark:bg-[#202124] rounded-xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700 transition-colors duration-300 max-h-[80vh] flex flex-col">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2d2e30] shrink-0">
          <div className="flex justify-between items-center mb-3">
            <h2 className="m-0 text-lg font-medium text-gray-900 dark:text-gray-100">My Switcher</h2>
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
          <div className="flex gap-2">
            <select 
              value={accountIndex}
              onChange={(e) => setAccountIndex(e.target.value)}
              className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#202124] text-gray-900 dark:text-gray-100 text-sm outline-none focus:border-blue-500 dark:focus:border-blue-400"
            >
              {Array.from({ length: accountCount }).map((_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? 'Account 0 (Default u/0)' : `Account ${i} (u/${i})`}
                </option>
              ))}
            </select>
            <button 
              onClick={() => {
                setAccountCount(prev => prev + 1);
                setAccountIndex(String(accountCount));
              }}
              className="flex items-center justify-center w-9 h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              title="Add Account to List"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* Main Content (Scrollable) */}
        <div className="overflow-y-auto flex-1 custom-scrollbar">
          <div className="px-4 pt-4 pb-1">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">AI Apps</h3>
          </div>
          {renderAppGrid(aiApps)}

          <div className="px-4 pt-2 pb-1">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">General</h3>
          </div>
          {renderAppGrid(generalApps)}

          {customApps.length > 0 && (
            <>
              <div className="px-4 pt-2 pb-1">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Custom</h3>
              </div>
              {renderAppGrid(customApps, true)}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2d2e30] flex flex-col items-center shrink-0">
          {!showCustomForm ? (
            <button 
              onClick={() => setShowCustomForm(true)}
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-4 py-2 rounded-md transition-colors"
            >
              + Add custom app
            </button>
          ) : (
            <div className="flex flex-col gap-2 w-full mt-2">
              <input 
                type="text" 
                placeholder="App Name (e.g. Colab)" 
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-[#202124] text-gray-900 dark:text-gray-100 text-sm"
              />
              <input 
                type="url" 
                placeholder="URL (e.g. https://colab.research.google.com)" 
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                className="p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-[#202124] text-gray-900 dark:text-gray-100 text-sm"
              />
              <div className="flex gap-2 justify-end mt-1">
                <button 
                  onClick={() => setShowCustomForm(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAddCustomApp}
                  className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
      
      <div className="fixed bottom-4 right-4 max-w-sm bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <h3 className="font-bold text-gray-900 dark:text-white mb-2">Extension Files Ready!</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
          The actual Chrome extension files have been generated in the <code>/public/extension</code> folder.
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          This UI is a live React preview of how the extension popup will look and behave.
        </p>
        <button
          onClick={handleDownloadZip}
          disabled={isZipping}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2 px-4 rounded-lg transition-colors font-medium text-sm"
        >
          <Download size={16} />
          {isZipping ? 'Generating ZIP...' : 'Download Extension ZIP'}
        </button>
      </div>
    </div>
  );
}
