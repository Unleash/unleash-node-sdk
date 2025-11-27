import { test } from 'vitest';
import nock from 'nock';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirp } from 'mkdirp';
import { writeFileSync } from 'fs';
import { Unleash } from '../unleash';

import { initialize, isEnabled, destroy } from '../index';

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

test('should be able to call api', (t) => {
  const url = mockNetwork();
  initialize({
    appName: 'foo',
    metricsInterval: 0,
    url,
    backupPath: getRandomBackupPath(),
  }).on('error', (err) => {
    throw err;
  });
  t.true(isEnabled('unknown') === false);
  destroy();
});

test('should load if backup file is corrupted', (t) =>
  new Promise((resolve) => {
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
          t.pass();
          resolve();
        }
      });
  }));

// FIXME: This test is flaky
test.skip('should be able to call isEnabled eventually', (t) =>
  new Promise((resolve) => {
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
        t.true(isEnabled('feature') === true);
        t.pass();
        resolve();
        destroy();
      });

    t.true(isEnabled('feature') === false);
  }));

test('should return fallbackValue if init was not called', (t) =>
  new Promise((resolve) => {
    t.true(isEnabled('feature') === false);
    t.true(isEnabled('feature', {}, false) === false);
    t.true(isEnabled('feature', {}, true) === true);
    resolve();
  }));
