import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import FileStorageProvider from '../../repository/storage-provider-file';

test('should handle empty string', async () => {
  const appNameLocal = 'test-sp';
  const backupPath = join(tmpdir());
  const backupFile = join(backupPath, `/unleash-backup-${appNameLocal}.json`);
  writeFileSync(backupFile, '');
  const storageProvider = new FileStorageProvider(backupPath);
  const result = await storageProvider.get(appNameLocal);
  expect(result).toBeUndefined();
});

test('should handle empty string with spaces', async () => {
  const appNameLocal = 'test-spaces';
  const backupPath = join(tmpdir());
  const backupFile = join(backupPath, `/unleash-backup-${appNameLocal}.json`);
  writeFileSync(backupFile, '                 ');
  const storageProvider = new FileStorageProvider(backupPath);
  const result = await storageProvider.get(appNameLocal);
  expect(result).toBeUndefined();
});

test('should return data', async () => {
  const appNameLocal = 'test-sp-content';
  const backupPath = join(tmpdir());
  const backupFile = join(backupPath, `/unleash-backup-${appNameLocal}.json`);
  writeFileSync(
    backupFile,
    JSON.stringify({
      features: [
        {
          name: 'feature-backup',
          enabled: true,
          strategies: [
            {
              name: 'default',
            },
          ],
        },
      ],
    }),
  );
  const storageProvider = new FileStorageProvider(backupPath);
  const result = await storageProvider.get(appNameLocal);

  // @ts-expect-error
  expect(result.features.length).toEqual(1);
  // @ts-expect-error
  expect(result.features[0].name).toEqual('feature-backup');
});
