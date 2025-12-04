import { promises } from 'node:fs';
import { join } from 'node:path';
import { safeName } from '../helpers';
import type { StorageProvider } from './storage-provider';

const { writeFile, readFile } = promises;

export default class FileStorageProvider<T> implements StorageProvider<T> {
  private backupPath: string;

  constructor(backupPath: string) {
    if (!backupPath) {
      throw new Error('backup Path is required');
    }
    this.backupPath = backupPath;
  }

  private getPath(key: string): string {
    return join(this.backupPath, `/unleash-backup-${safeName(key)}.json`);
  }

  async set(key: string, data: T): Promise<void> {
    return writeFile(this.getPath(key), JSON.stringify(data));
  }

  async get(key: string): Promise<T | undefined> {
    const path = this.getPath(key);
    let data: string | undefined;
    try {
      data = await readFile(path, 'utf8');
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }

    if (!data || data.trim().length === 0) {
      return undefined;
    }

    try {
      return JSON.parse(data);
    } catch (error: unknown) {
      if (error instanceof Error) {
        error.message = `Unleash storage failed parsing file ${path}: ${error.message}`;
      }
      throw error;
    }
  }
}
