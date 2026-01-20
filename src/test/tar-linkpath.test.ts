import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as tar from 'tar';
import { expect, test } from 'vitest';

test('tar sanitizes hardlink and symlink linkpaths when preservePaths is false', async () => {
  if (process.platform === 'win32') {
    return;
  }

  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unleash-tar-'));
  const outDir = path.join(baseDir, 'out');
  const secretPath = path.join(baseDir, 'secret.txt');
  const tarFile = path.join(baseDir, 'exploit.tar');
  const targetSym = '/etc/passwd';

  fs.mkdirSync(outDir);
  fs.writeFileSync(secretPath, 'ORIGINAL_DATA');

  const hardlinkHeader = new tar.Header({
    path: 'exploit_hard',
    type: 'Link',
    size: 0,
    linkpath: secretPath,
  });
  hardlinkHeader.encode();
  const hardlinkBlock = hardlinkHeader.block;
  if (!hardlinkBlock) {
    throw new Error('Failed to encode hardlink header block');
  }

  const symlinkHeader = new tar.Header({
    path: 'exploit_sym',
    type: 'SymbolicLink',
    size: 0,
    linkpath: targetSym,
  });
  symlinkHeader.encode();
  const symlinkBlock = symlinkHeader.block;
  if (!symlinkBlock) {
    throw new Error('Failed to encode symlink header block');
  }

  fs.writeFileSync(tarFile, Buffer.concat([hardlinkBlock, symlinkBlock, Buffer.alloc(1024)]));

  try {
    await tar.x({
      cwd: outDir,
      file: tarFile,
      preservePaths: false,
    });
  } catch {
    // Refusal to extract unsafe entries is acceptable.
  }

  fs.writeFileSync(path.join(outDir, 'exploit_hard'), 'OVERWRITTEN');
  expect(fs.readFileSync(secretPath, 'utf8')).toBe('ORIGINAL_DATA');

  let symlinkTarget: string | null = null;
  try {
    symlinkTarget = fs.readlinkSync(path.join(outDir, 'exploit_sym'));
  } catch {
    symlinkTarget = null;
  }

  expect(symlinkTarget).not.toBe(targetSym);

  fs.rmSync(baseDir, { recursive: true, force: true });
});
