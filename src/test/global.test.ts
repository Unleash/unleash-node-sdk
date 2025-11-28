import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirp } from 'mkdirp';
import nock from 'nock';
import { expect, test } from 'vitest';
import { destroy, initialize, isEnabled } from '../index';
import { Unleash } from '../unleash';

function getRandomBackupPath() {
  const path = join(tmpdir(), `test-tmp-${Math.round(Math.random() * 100000)}`);
  mkdirp.sync(path);
  return path;
}

const defaultToggles = [
  {
    name: 'feature',
    enabled: true,
    strategies: [],
  },
];

let counter = 0;
function mockNetwork(toggles = defaultToggles) {
  counter += 1;
  const url = `http://unleash-${counter}.app`;
  nock(url).get('/client/features').reply(200, { features: toggles });
  return url;
}

test('should be able to call api', () => {
  const url = mockNetwork();
  initialize({
    appName: 'foo',
    metricsInterval: 0,
    url,
    backupPath: getRandomBackupPath(),
  }).on('error', (err) => {
    throw err;
  });
  expect(isEnabled('unknown')).toBe(false);
  destroy();
});

test('should load if backup file is corrupted', (t) =>
  new Promise<void>((resolve) => {
    const url = mockNetwork();
    const backupPath = join(tmpdir());
    const backupFile = join(backupPath, `/unleash-backup-with-corrupted-JSON.json`);
    writeFileSync(backupFile, '{broken-json');

    const instance = new Unleash({
      appName: 'with-corrupted-JSON',
      metricsInterval: 0,
      url,
      backupPath,
      refreshInterval: 0,
    });

    instance
      .on('error', (err) => {
        destroy();
        throw err;
      })
      .on('warn', (err) => {
        if (err?.message?.includes('Unleash storage failed parsing file')) {
          destroy();
          resolve();
        }
      });
  }));

// FIXME: This test is flaky
test.skip('should be able to call isEnabled eventually', (t) =>
  new Promise<void>((resolve) => {
    const url = mockNetwork();
    initialize({
      appName: 'foo',
      metricsInterval: 0,
      url,
      backupPath: getRandomBackupPath(),
    })
      .on('error', (err) => {
        throw err;
      })
      .on('synchronized', async () => {
        expect(isEnabled('feature')).toBe(true);
        resolve();
        destroy();
      });
    expect(isEnabled('feature')).toBe(false);
  }));

test('should return fallbackValue if init was not called', (t) => {
  expect(isEnabled('feature')).toBe(false);
  expect(isEnabled('feature', {}, false)).toBe(false);
  expect(isEnabled('feature', {}, true)).toBe(true);
});
