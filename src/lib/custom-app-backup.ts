import {sanitizeCustomApps} from '@/lib/popup-state';
import type {AppEntry, CustomAppsBackupPayload} from '@/types/extension';

const backupAppId = 'my-switcher';
const backupSchemaVersion = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finalizeImportedCustomApps(rawCustomApps: unknown): AppEntry[] {
  if (!Array.isArray(rawCustomApps)) {
    throw new Error('Import file is missing the customApps list.');
  }

  const sanitizedCustomApps = sanitizeCustomApps(rawCustomApps);

  if (rawCustomApps.length > 0 && sanitizedCustomApps.length === 0) {
    throw new Error('Import file does not contain any valid custom apps.');
  }

  if (sanitizedCustomApps.length !== rawCustomApps.length) {
    throw new Error('Import file contains invalid custom app entries.');
  }

  return sanitizedCustomApps;
}

export function createCustomAppsBackup(customApps: AppEntry[]): string {
  const payload: CustomAppsBackupPayload = {
    app: backupAppId,
    schemaVersion: backupSchemaVersion,
    exportedAt: new Date().toISOString(),
    customApps: sanitizeCustomApps(customApps),
  };

  return JSON.stringify(payload, null, 2);
}

export function createCustomAppsBackupFileName(): string {
  const dateStamp = new Date().toISOString().slice(0, 10);
  return `my-switcher-custom-apps-${dateStamp}.json`;
}

export function parseCustomAppsBackup(rawInput: string): AppEntry[] {
  let parsedInput: unknown;

  try {
    parsedInput = JSON.parse(rawInput);
  } catch {
    throw new Error('Import file is not valid JSON.');
  }

  if (Array.isArray(parsedInput)) {
    return finalizeImportedCustomApps(parsedInput);
  }

  if (!isRecord(parsedInput)) {
    throw new Error('Import file format is invalid.');
  }

  if (
    parsedInput.app !== undefined &&
    parsedInput.app !== backupAppId
  ) {
    throw new Error('Import file is not a My Switcher backup.');
  }

  if (
    parsedInput.schemaVersion !== undefined &&
    parsedInput.schemaVersion !== backupSchemaVersion
  ) {
    throw new Error('Import file schema version is not supported.');
  }

  return finalizeImportedCustomApps(parsedInput.customApps);
}
