import fs from 'node:fs';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

const extensionRoot = path.resolve(__dirname, 'public', 'extension');
const manifestPath = path.resolve(__dirname, 'extension', 'manifest.json');

function firefoxExtensionBundle() {
  return {
    name: 'firefox-extension-bundle',
    apply: 'build' as const,
    generateBundle() {
      const iconFiles = fs
        .readdirSync(extensionRoot)
        .filter((fileName) => /^icon(?:-\d+)?\.(png|svg)$/i.test(fileName));

      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: fs.readFileSync(manifestPath, 'utf8'),
      });

      for (const iconFile of iconFiles) {
        this.emitFile({
          type: 'asset',
          fileName: iconFile,
          source: fs.readFileSync(path.join(extensionRoot, iconFile)),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), firefoxExtensionBundle()],
  publicDir: false,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    hmr: process.env.DISABLE_HMR !== 'true',
  },
  build: {
    outDir: path.resolve(__dirname, 'dist', 'firefox'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'popup.html'),
      },
    },
  },
});