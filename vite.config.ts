import fs from 'node:fs';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

const extensionRoot = path.resolve(__dirname, 'public', 'extension');

function resolveTargetManifest(target: string) {
  const manifestFileName = target === 'firefox' ? 'manifest.firefox.json' : 'manifest.json';
  return path.resolve(__dirname, 'extension', manifestFileName);
}

function extensionBundle(manifestPath: string) {
  return {
    name: 'extension-bundle',
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

export default defineConfig(() => {
  const extensionTarget = process.env.EXTENSION_TARGET === 'firefox' ? 'firefox' : 'chrome';
  const manifestPath = resolveTargetManifest(extensionTarget);

  return {
    plugins: [react(), extensionBundle(manifestPath)],
    publicDir: false as const,
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
      outDir: path.resolve(__dirname, 'dist', extensionTarget),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: path.resolve(__dirname, 'popup.html'),
          background: path.resolve(__dirname, 'src', 'background.ts'),
        },
        output: {
          entryFileNames(chunkInfo) {
            return chunkInfo.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js';
          },
        },
      },
    },
  };
});
