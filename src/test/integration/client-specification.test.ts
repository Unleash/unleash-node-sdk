import { tmpdir } from 'node:os';
import { join } from 'node:path';
import specs from '@unleash/client-specification/specifications/index.json';
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

const loadDefinition = (testName: string) => {
  const mod = require(`@unleash/client-specification/specifications/${testName}`);
  return mod.default ?? mod;
};
// @ts-expect-error
function mockNetwork(toggles, url = getUrl()) {
  nock(url).get('/client/features').reply(200, toggles);
  return url;
}

specs.forEach((testName) => {
  const definition = loadDefinition(`${testName}`);

  if (definition.tests) {
    // @ts-expect-error
    definition.tests.forEach((testCase) => {
      test(`${testName}:${testCase.description}`, async () => {
        await new Promise<void>((resolve, reject) => {
          // Mock unleash-api
          const url = mockNetwork(definition.state);

          // New unleash instance
          const instance = new Unleash({
            appName: testName,
            disableMetrics: true,
            skipInstanceCountWarning: true,
            url,
            backupPath: getRandomBackupPath(definition.name),
          });

          instance.on('error', reject);
          instance.on('synchronized', () => {
            const result = instance.isEnabled(testCase.toggleName, testCase.context);
            expect(result).toStrictEqual(testCase.expectedResult);
            instance.destroy();
            resolve();
          });
        });
      });
    });
  }

  if (definition.variantTests) {
    // @ts-expect-error
    definition.variantTests.forEach((testCase) => {
      test(`${testName}:${testCase.description}`, async () =>
        await new Promise<void>((resolve, reject) => {
          // Mock unleash-api
          const url = mockNetwork(definition.state);

          // New unleash instance
          const instance = new Unleash({
            appName: testName,
            disableMetrics: true,
            skipInstanceCountWarning: true,
            url,
            backupPath: getRandomBackupPath(definition.name),
          });

          instance.on('error', reject);
          instance.on('synchronized', () => {
            const result = instance.getVariant(testCase.toggleName, testCase.context);
            expect(result).toStrictEqual({
              ...testCase.expectedResult,
              featureEnabled: testCase.expectedResult.feature_enabled,
            });
            instance.destroy();
            resolve();
          });
        }));
    });
  }
});
