import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirp } from 'mkdirp';
import nock from 'nock';
import { expect, test } from 'vitest';
import { Unleash } from '../../unleash';

let counter = 1;
const getUrl = () => `http://client-spec-${counter++}.app/`;

const getRandomBackupPath = (testName: string) => {
  const path = join(tmpdir(), `test-${testName}-${Math.round(Math.random() * 100000)}`);
  mkdirp.sync(path);
  return path;
};

const mockNetwork = (flags: typeof FLAGS, url = getUrl()) => {
  nock(url).get('/client/features').reply(200, flags);
  return url;
};

const FLAG = 'context.test.flag';
const FLAG_FALSY = `${FLAG}-falsy`;
const STRING_CTX = 'yes';
const NUMBER_SEVEN_CTX = 7;
const NUMBER_ZERO_CTX = 0;
const BOOL_TRUE_CTX = true;
const BOOL_FALSE_CTX = false;

const FLAGS = {
  version: 1,
  features: [
    {
      name: FLAG,
      description: 'Tests that context is properly handled',
      enabled: true,
      strategies: [
        {
          name: 'default',
          constraints: [
            {
              contextName: 'test',
              operator: 'IN',
              values: [STRING_CTX, NUMBER_SEVEN_CTX.toString(), BOOL_TRUE_CTX.toString()],
            },
          ],
        },
      ],
    },
    {
      name: FLAG_FALSY,
      description: 'Tests that falsy context values are properly handled',
      enabled: true,
      strategies: [
        {
          name: 'default',
          constraints: [
            {
              contextName: 'test',
              operator: 'IN',
              values: [NUMBER_ZERO_CTX.toString(), BOOL_FALSE_CTX.toString()],
            },
          ],
        },
      ],
    },
  ],
};

test('should be enabled for string context field', async () => {
  await new Promise<void>((resolve, reject) => {
    // Mock unleash-api
    const url = mockNetwork(FLAGS);

    // New unleash instance
    const instance = new Unleash({
      appName: 'Test',
      disableMetrics: true,
      environment: 'test',
      url,
      backupPath: getRandomBackupPath('test-context'),
    });

    instance.on('error', reject);
    instance.on('synchronized', () => {
      const result = instance.isEnabled(FLAG, { properties: { test: STRING_CTX } });
      expect(result).toBe(true);
      instance.destroy();
      resolve();
    });
  });
});

test('should be enabled for number context field', async () =>
  await new Promise<void>((resolve, reject) => {
    // Mock unleash-api
    const url = mockNetwork(FLAGS);

    // New unleash instance
    const instance = new Unleash({
      appName: 'Test',
      disableMetrics: true,
      environment: 'test',
      url,
      backupPath: getRandomBackupPath('test-context'),
    });

    instance.on('error', reject);
    instance.on('synchronized', () => {
      const result = instance.isEnabled(FLAG, { properties: { test: NUMBER_SEVEN_CTX } });
      expect(result).toBe(true);
      instance.destroy();
      resolve();
    });
  }));

test('should be enabled for boolean context field', async () => {
  await new Promise<void>((resolve, reject) => {
    // Mock unleash-api
    const url = mockNetwork(FLAGS);

    // New unleash instance
    const instance = new Unleash({
      appName: 'Test',
      disableMetrics: true,
      environment: 'test',
      url,
      backupPath: getRandomBackupPath('test-context'),
    });

    instance.on('error', reject);
    instance.on('synchronized', () => {
      // @ts-expect-error
      const result = instance.isEnabled(FLAG, { properties: { test: BOOL_TRUE_CTX } });
      expect(result).toBe(true);
      instance.destroy();
      resolve();
    });
  });
});

test('should gracefully handle null or undefined context fields', async () => {
  new Promise<void>((resolve, reject) => {
    // Mock unleash-api
    const url = mockNetwork(FLAGS);

    // New unleash instance
    const instance = new Unleash({
      appName: 'Test',
      disableMetrics: true,
      environment: 'test',
      url,
      backupPath: getRandomBackupPath('test-context'),
    });

    instance.on('error', reject);
    instance.on('synchronized', () => {
      // @ts-expect-error
      const result1 = instance.isEnabled(FLAG, { properties: { test: null } });
      expect(result1).toBe(false);
      const result2 = instance.isEnabled(FLAG, { properties: { test: undefined } });
      expect(result2).toBe(false);
      instance.destroy();
      resolve();
    });
  });
});

test('should support "0" as a number context field value', async () => {
  await new Promise<void>((resolve, reject) => {
    // Mock unleash-api
    const url = mockNetwork(FLAGS);

    // New unleash instance
    const instance = new Unleash({
      appName: 'Test',
      disableMetrics: true,
      environment: 'test',
      url,
      backupPath: getRandomBackupPath('test-context'),
    });

    instance.on('error', reject);
    instance.on('synchronized', () => {
      const result = instance.isEnabled(FLAG_FALSY, { properties: { test: NUMBER_ZERO_CTX } });
      expect(result).toBe(true);
      instance.destroy();
      resolve();
    });
  });
});

test('should support "false" as a boolean context field value', async () => {
  await new Promise<void>((resolve, reject) => {
    // Mock unleash-api
    const url = mockNetwork(FLAGS);

    // New unleash instance
    const instance = new Unleash({
      appName: 'Test',
      disableMetrics: true,
      environment: 'test',
      url,
      backupPath: getRandomBackupPath('test-context'),
    });

    instance.on('error', reject);
    instance.on('synchronized', () => {
      // @ts-expect-error
      const result = instance.isEnabled(FLAG_FALSY, { properties: { test: BOOL_FALSE_CTX } });
      expect(result).toBe(true);
      instance.destroy();
      resolve();
    });
  });
});
