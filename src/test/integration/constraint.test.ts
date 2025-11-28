import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirp } from 'mkdirp';
import nock from 'nock';
import { expect, test } from 'vitest';

import { Unleash } from '../../unleash';

let counter = 1;
const getUrl = () => `http://client-spec-${counter++}.app/`;

// @ts-expect-error
function getRandomBackupPath(testName) {
  const path = join(tmpdir(), `test-${testName}-${Math.round(Math.random() * 100000)}`);
  mkdirp.sync(path);
  return path;
}

// @ts-expect-error
function mockNetwork(toggles, url = getUrl()) {
  nock(url).get('/client/features').reply(200, toggles);
  return url;
}

const toggles = {
  version: 1,
  features: [
    {
      name: 'toggle.with.constraint.enabled',
      description: 'readme',
      enabled: true,
      strategies: [
        {
          name: 'default',
          constraints: [{ contextName: 'environment', operator: 'IN', values: ['test', 'dev'] }],
        },
      ],
    },
    {
      name: 'toggle.with.constraint.enabled',
      description: 'readme',
      enabled: true,
      strategies: [
        {
          name: 'default',
          constraints: [{ contextName: 'environment', operator: 'IN', values: ['test', 'dev'] }],
        },
      ],
    },
    {
      name: 'toggle.with.constraint.not_in.enabled',
      description: 'readme',
      enabled: true,
      strategies: [
        {
          name: 'default',
          constraints: [
            { contextName: 'environment', operator: 'NOT_IN', values: ['prod', 'dev'] },
          ],
        },
      ],
    },
  ],
};

test('should be enabled for satisfied constraint', async () => {
  await new Promise<void>((resolve, reject) => {
    // Mock unleash-api
    const url = mockNetwork(toggles);

    // New unleash instance
    const instance = new Unleash({
      appName: 'Test',
      disableMetrics: true,
      environment: 'test',
      url,
      backupPath: getRandomBackupPath('with-constraint'),
    });

    instance.on('error', reject);
    instance.on('synchronized', () => {
      const result = instance.isEnabled('toggle.with.constraint.enabled');
      expect(result).toBe(true);
      instance.destroy();
      resolve();
    });
  });
});

test('should be enabled for satisfied NOT_IN constraint', async () => {
  await new Promise<void>((resolve, reject) => {
    // Mock unleash-api
    const url = mockNetwork(toggles);

    // New unleash instance
    const instance = new Unleash({
      appName: 'Test',
      disableMetrics: true,
      environment: 'test',
      url,
      backupPath: getRandomBackupPath('with-constraint'),
    });

    instance.on('error', reject);
    instance.on('synchronized', () => {
      const result = instance.isEnabled('toggle.with.constraint.not_in.enabled', {
        userId: '123',
      });
      expect(result).toBe(true);
      instance.destroy();
      resolve();
    });
  });
});
