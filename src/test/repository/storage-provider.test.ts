import { test } from 'vitest';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import FileStorageProvider from '../../repository/storage-provider-file';

test('should handle empty string', async (t) => {
  const appNameLocal = 'test-sp';
  const backupPath = join(tmpdir());
  const backupFile = join(backupPath, `/unleash-backup-${appNameLocal}.json`);
  writeFileSync(backupFile, '');
  const storageProvider = new FileStorageProvider(backupPath);
  const result = await storageProvider.get(appNameLocal);
  t.is(result, undefined);
});

test('should handle empty string with spaces', async (t) => {
  const appNameLocal = 'test-spaces';
  const backupPath = join(tmpdir());
  const backupFile = join(backupPath, `/unleash-backup-${appNameLocal}.json`);
  writeFileSync(backupFile, '                 ');
  const storageProvider = new FileStorageProvider(backupPath);
  const result = await storageProvider.get(appNameLocal);
  t.is(result, undefined);
});

test('should return data', async (t) => {
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
  t.is(result.features.length, 1);
  // @ts-expect-error
  t.is(result.features[0].name, 'feature-backup');
});
