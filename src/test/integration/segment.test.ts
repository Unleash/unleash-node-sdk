import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'ava';
import { mkdirp } from 'mkdirp';
import * as nock from 'nock';

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
      name: 'toggle.with.global.segment',
      description: 'readme',
      enabled: true,
      strategies: [
        {
          name: 'default',
          constraints: [],
          segments: [1],
        },
      ],
    },
  ],
  segments: [
    {
      id: 1,
      constraints: [{ contextName: 'environment', operator: 'NOT_IN', values: ['test', 'dev'] }],
    },
  ],
};

test('should use global segments for constraint calculation', (t) =>
  new Promise((resolve, reject) => {
    const url = mockNetwork(toggles);

    const instance = new Unleash({
      appName: 'Test',
      disableMetrics: true,
      environment: 'test',
      url,
      backupPath: getRandomBackupPath('with-constraint'),
    });

    instance.on('error', reject);
    instance.on('synchronized', () => {
      const result = instance.isEnabled('toggle.with.global.segment');
      t.is(result, false);
      instance.destroy();
      resolve();
    });
  }));

test('should resolve to false if required global segment cannot be found', (t) =>
  new Promise((resolve, reject) => {
    const togglesWithoutGlobalSegment = { ...toggles };
    // @ts-expect-error
    togglesWithoutGlobalSegment.segments = undefined;
    const url = mockNetwork(togglesWithoutGlobalSegment);

    const instance = new Unleash({
      appName: 'Test',
      disableMetrics: true,
      environment: 'test',
      url,
      backupPath: getRandomBackupPath('with-constraint'),
    });

    instance.on('error', reject);
    instance.on('synchronized', () => {
      const result = instance.isEnabled('toggle.with.global.segment');
      t.is(result, false);
      instance.destroy();
      resolve();
    });
  }));

test('should handle case where segment is not present on strategy', (t) =>
  new Promise((resolve, reject) => {
    const togglesWithoutSegmentIds = { ...toggles };
    // @ts-expect-error
    togglesWithoutSegmentIds.features[0].strategies[0].segments = undefined;
    const url = mockNetwork(togglesWithoutSegmentIds);

    const instance = new Unleash({
      appName: 'Test',
      disableMetrics: true,
      environment: 'test',
      url,
      backupPath: getRandomBackupPath('with-constraint'),
    });

    instance.on('error', reject);
    instance.on('synchronized', () => {
      const result = instance.isEnabled('toggle.with.global.segment');
      t.is(result, true);
      instance.destroy();
      resolve();
    });
  }));
