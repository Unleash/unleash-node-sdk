import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirp } from 'mkdirp';
import nock from 'nock';
import { expect, test } from 'vitest';
import { Unleash } from '../unleash';

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

test('should increase instanceCount every time sdk is created ', () => {
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
  // @ts-expect-error
  expect(Unleash.instanceCount).toBe(3);

  u1.destroy();
  u2.destroy();
  u3.destroy();
});
