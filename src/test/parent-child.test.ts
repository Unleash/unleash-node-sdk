import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirp } from 'mkdirp';
import nock from 'nock';
import { assert, expect, test, vi } from 'vitest';
import { InMemStorageProvider, startUnleash } from '..';
import type { RepositoryInterface } from '../repository';
import { Strategy, Unleash, UnleashEvents } from '../unleash';
import FakeRepo from './fake_repo';

const getUrl = () => `http://test2${Math.round(Math.random() * 100000)}.app/`;

function getRandomBackupPath() {
  const path = join(tmpdir(), `test-tmp-${Math.round(Math.random() * 100000)}`);
  mkdirp.sync(path);
  return path;
}

const defaultToggles = [
  {
    name: 'A',
    enabled: true,
    strategies: [
      {
        name: 'flexibleRollout',
        constraints: [],
        parameters: { rollout: '50', groupId: 'A', stickiness: 'default' },
      },
    ],
  },
  {
    name: 'B',
    enabled: true,
    strategies: [
      {
        name: 'flexibleRollout',
        constraints: [],
        parameters: { rollout: '100', groupId: 'A', stickiness: 'default' },
      },
    ],
    dependencies: [{ feature: 'A', enabled: true }],
  },
  {
    name: 'C',
    enabled: true,
    strategies: [
      {
        name: 'flexibleRollout',
        constraints: [],
        parameters: { rollout: '100', groupId: 'A', stickiness: 'default' },
      },
    ],
    dependencies: [{ feature: 'A', enabled: true }],
  },
];

function mockNetwork(toggles = defaultToggles, url = getUrl()) {
  nock(url)
    .get('/client/features')
    .matchHeader('unleash-connection-id', /^.{36}$/)
    .reply(200, { features: toggles });
  return url;
}

test('should consider known feature-toggle as active', async () => {
  const url = mockNetwork();
  const instance = await startUnleash({
    appName: 'foo',
    disableMetrics: true,
    skipInstanceCountWarning: true,
    url,
    bootstrap: { data: defaultToggles },
  });

  expect(instance.isSynchronized()).toBe(true);
  const parentEnabled = instance.isEnabled('A');
  expect(instance.isEnabled('B')).toBe(parentEnabled);
  expect(instance.isEnabled('C')).toBe(parentEnabled);
  await instance.destroy();
});
