import { test } from 'vitest';
import nock from 'nock';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirp } from 'mkdirp';

import { Unleash, UnleashEvents } from '../unleash';

const getUrl = () => `http://test2${Math.round(Math.random() * 100000)}.app/`;

function getRandomBackupPath() {
  const path = join(tmpdir(), `test-tmp-${Math.round(Math.random() * 100000)}`);
  mkdirp.sync(path);
  return path;
}

const defaultToggles = [
  {
    name: 'feature',
    enabled: true,
    strategies: [{ name: 'default', constraints: [] }],
  },
  {
    name: 'f-context',
    enabled: true,
    strategies: [
      {
        name: 'EnvironmentStrategy',
        constraints: [],
        parameters: {
          environments: 'prod',
        },
      },
    ],
  },
];

function mockNetwork(toggles = defaultToggles, url = getUrl()) {
  nock(url).get('/client/features').reply(200, { features: toggles });
  return url;
}

test('should increase instanceCount every time sdk is created ', (t) => {
  const baseUrl = `${getUrl()}api`;
  mockNetwork([], baseUrl);

  const u1 = new Unleash({
    appName: 'instance-count-1',
    disableMetrics: true,
    backupPath: getRandomBackupPath(),
    url: baseUrl,
  });
  const u2 = new Unleash({
    appName: 'instance-count-2',
    disableMetrics: true,
    backupPath: getRandomBackupPath(),
    url: baseUrl,
  });
  const u3 = new Unleash({
    appName: 'instance-count-3',
    disableMetrics: true,
    backupPath: getRandomBackupPath(),
    url: baseUrl,
  });
  const u4 = new Unleash({
    appName: 'instance-count-3',
    disableMetrics: true,
    backupPath: getRandomBackupPath(),
    url: baseUrl,
  });
  const u5 = new Unleash({
    appName: 'instance-count-3',
    disableMetrics: true,
    backupPath: getRandomBackupPath(),
    url: baseUrl,
  });
  const u6 = new Unleash({
    appName: 'instance-count-3',
    disableMetrics: true,
    backupPath: getRandomBackupPath(),
    url: baseUrl,
  });
  const u7 = new Unleash({
    appName: 'instance-count-3',
    disableMetrics: true,
    backupPath: getRandomBackupPath(),
    url: baseUrl,
  });
  const u8 = new Unleash({
    appName: 'instance-count-3',
    disableMetrics: true,
    backupPath: getRandomBackupPath(),
    url: baseUrl,
  });
  const u9 = new Unleash({
    appName: 'instance-count-3',
    disableMetrics: true,
    backupPath: getRandomBackupPath(),
    url: baseUrl,
  });
  const u10 = new Unleash({
    appName: 'instance-count-3',
    disableMetrics: true,
    backupPath: getRandomBackupPath(),
    url: baseUrl,
  });
  const u11 = new Unleash({
    appName: 'instance-count-3',
    disableMetrics: true,
    backupPath: getRandomBackupPath(),
    url: baseUrl,
  });

  return new Promise((resolve) => {
    u11.on(UnleashEvents.Error, (e) => {
      t.is(e.message, 'The unleash SDK has been initialized more than 10 times');
      // @ts-expect-error
      t.is(Unleash.instanceCount, 11);

      u1.destroy();
      u2.destroy();
      u3.destroy();
      u4.destroy();
      u5.destroy();
      u6.destroy();
      u7.destroy();
      u8.destroy();
      u9.destroy();
      u10.destroy();
      u11.destroy();
      resolve();
    });
  });
});
