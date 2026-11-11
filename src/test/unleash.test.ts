import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ClientFeatures } from '@unleash/yggdrasil-engine';
import { mkdirp } from 'mkdirp';
import nock from 'nock';
import { assert, expect, test, vi } from 'vitest';
import type { Context } from '../context';
import type { MetricsData } from '../request';
import type { Strategy } from '../strategy';
import { Unleash, UnleashEvents } from '../unleash';
import { FakeFetcher } from './fixtures';

class EnvironmentStrategy implements Strategy {
  name = 'EnvironmentStrategy';

  isEnabled(parameters: Record<string, unknown>, context: Context) {
    return String(parameters.environments).indexOf(context.environment ?? '') !== -1;
  }
}

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
  nock(url)
    .get('/client/features')
    .matchHeader('unleash-connection-id', /^.{36}$/)
    .reply(200, { version: 2, query: undefined, features: toggles });
  return url;
}

test('should error when missing url', () => {
  // @ts-expect-error
  expect(() => new Unleash({ skipInstanceCountWarning: true })).toThrow();
  // @ts-expect-error
  expect(() => new Unleash({ url: false, skipInstanceCountWarning: true })).toThrow();
  expect(
    () =>
      new Unleash({
        url: 'http://unleash.github.io',
        // @ts-expect-error
        appName: false,
        skipInstanceCountWarning: true,
      }),
  ).toThrow();
});

test('calling destroy synchronously should avoid network activity', () => {
  const url = getUrl();
  // Don't call mockNetwork. If destroy didn't work, then we would have an
  // uncaught exception.
  const instance = new Unleash({
    skipInstanceCountWarning: true,
    appName: 'foo',
    url,
    disableMetrics: true,
  });
  instance.destroy();
  assert.ok(true);
});

test('should handle old url', async () => {
  await new Promise<void>((resolve) => {
    const url = mockNetwork([]);

    const instance = new Unleash({
      appName: 'foo',
      refreshInterval: 0,
      metricsInterval: 0,
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url: `${url}features`,
    });

    expect.assertions(1);
    instance.on('warn', (e) => {
      expect(e).toBeTruthy();
      resolve();
    });

    instance.destroy();
  });
});

test('should handle url without ending /', () => {
  const baseUrl = `${getUrl()}api`;

  mockNetwork([], baseUrl);

  const instance = new Unleash({
    appName: 'foo',
    refreshInterval: 0,
    metricsInterval: 0,
    disableMetrics: true,
    skipInstanceCountWarning: true,
    url: baseUrl,
  });

  // @ts-expect-error
  expect(`${baseUrl}/` === instance.repository.url).toBe(true);
  // @ts-expect-error
  expect(`${baseUrl}/` === instance.metrics.url).toBe(true);

  instance.destroy();
});

test('should re-emit error from repository and metrics', () => {
  const url = mockNetwork([]);

  const instance = new Unleash({
    appName: 'foo',
    refreshInterval: 0,
    metricsInterval: 0,
    disableMetrics: true,
    skipInstanceCountWarning: true,
    url,
  });

  expect.assertions(2);
  instance.on('error', (e) => {
    expect(e).toBeTruthy();
  });
  // @ts-expect-error
  instance.repository.emit('error', new Error());
  // @ts-expect-error
  instance.metrics.emit('error', new Error());

  instance.destroy();
});

test('should re-emit events from repository and metrics', () => {
  const url = mockNetwork();
  const instance = new Unleash({
    appName: 'foo',
    refreshInterval: 0,
    disableMetrics: true,
    skipInstanceCountWarning: true,
    url,
  });

  expect.assertions(6);
  instance.on(UnleashEvents.Warn, (e) => expect(e).toBeTruthy());
  instance.on(UnleashEvents.Sent, (e) => expect(e).toBeTruthy());
  instance.on(UnleashEvents.Registered, (e) => expect(e).toBeTruthy());
  instance.on(UnleashEvents.Unchanged, (e) => expect(e).toBeTruthy());
  instance.on(UnleashEvents.Changed, (e) => expect(e).toBeTruthy());

  // @ts-expect-error
  instance.repository.emit(UnleashEvents.Warn, true);
  // @ts-expect-error
  instance.repository.emit(UnleashEvents.Changed, true);
  // @ts-expect-error
  instance.repository.emit(UnleashEvents.Unchanged, true);
  // @ts-expect-error
  instance.metrics.emit(UnleashEvents.Warn, true);
  // @ts-expect-error
  instance.metrics.emit(UnleashEvents.Sent, true);
  // @ts-expect-error
  instance.metrics.emit(UnleashEvents.Registered, true);

  instance.destroy();
});

test('repository should surface error when invalid basePath', async () => {
  await new Promise<void>((resolve) => {
    const url = 'http://unleash-surface.app/';
    nock(url)
      .get('/client/features')
      .delay(100)
      .reply(200, { version: 2, query: undefined, features: [] });
    const backupPath = join(tmpdir(), `test-tmp-${Math.round(Math.random() * 100000)}`);
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url: `${url}bougus`,
      backupPath,
    });

    instance.once('error', (err) => {
      expect(err).toBeTruthy();
      expect(err.code).toEqual('ERR_NOCK_NO_MATCH');

      instance.destroy();

      resolve();
    });
  });
});

test('should allow request even before unleash is initialized', () => {
  const url = mockNetwork();
  const instance = new Unleash({
    appName: 'foo',
    disableMetrics: true,
    skipInstanceCountWarning: true,
    url,
    backupPath: getRandomBackupPath(),
  }).on('error', (err) => {
    throw err;
  });
  expect(instance.isEnabled('unknown')).toBe(false);
  instance.destroy();
});

test('should consider known feature-toggle as active', async () => {
  await new Promise<void>((resolve, reject) => {
    const url = mockNetwork();
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url,
      backupPath: getRandomBackupPath(),
    }).on('error', reject);

    instance.on('synchronized', () => {
      expect(instance.isEnabled('feature')).toBe(true);
      instance.destroy();
      resolve();
    });
  });
});

test('should consider unknown feature-toggle as disabled', async () => {
  await new Promise<void>((resolve, reject) => {
    const url = mockNetwork();
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url,
      backupPath: getRandomBackupPath(),
    }).on('error', reject);

    instance.on('synchronized', () => {
      expect(instance.isEnabled('unknown')).toBe(false);
      instance.destroy();
      resolve();
    });
  });
});

test('should return fallback value until online', async () => {
  await new Promise<void>((resolve, reject) => {
    const url = mockNetwork();
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url,
      backupPath: getRandomBackupPath(),
    }).on('error', reject);

    let warnCounter = 0;
    instance.on('warn', () => {
      warnCounter++;
    });
    expect(instance.isEnabled('feature')).toBe(false);
    expect(warnCounter).toBe(1);
    expect(instance.isEnabled('feature', {}, false)).toBe(false);
    expect(instance.isEnabled('feature', {}, true)).toBe(true);
    expect(warnCounter).toBe(3);

    instance.on('synchronized', () => {
      expect(instance.isEnabled('feature')).toBe(true);
      expect(instance.isEnabled('feature', {}, false)).toBe(true);
      instance.destroy();
      resolve();
    });
  });
});

test('should call fallback function for unknown feature-toggle', async () => {
  await new Promise<void>((resolve, reject) => {
    const url = mockNetwork();
    const instance = new Unleash({
      appName: 'foo',
      environment: 'test',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url,
      backupPath: getRandomBackupPath(),
    }).on('error', reject);

    instance.on('synchronized', () => {
      const fallbackFunc = vi.fn(() => false);
      const name = 'unknown';
      const result = instance.isEnabled(name, { userId: '123' }, fallbackFunc);
      expect(result).toBe(false);
      expect(fallbackFunc).toHaveBeenCalledWith(name, {
        appName: 'foo',
        environment: 'test',
        userId: '123',
      });
      instance.destroy();
      resolve();
    });
  });
});

test('should not throw when os.userInfo throws', async () => {
  expect.assertions(0);

  await new Promise<void>((resolve, reject) => {
    const userInfo = vi.spyOn(require('node:os'), 'userInfo').mockImplementation(() => {
      throw new Error('Test exception');
    });
    const url = mockNetwork();
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url,
      backupPath: getRandomBackupPath(),
    }).on('error', reject);

    instance.on('synchronized', () => {
      instance.destroy();
      userInfo.mockRestore();
      resolve();
    });
  });
});

test('should return feature-toggles', async () => {
  await new Promise<void>((resolve, reject) => {
    const url = mockNetwork();
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url,
      backupPath: getRandomBackupPath(),
    }).on('error', reject);

    instance.on('synchronized', () => {
      const toggles = instance.getFeatureToggleDefinitions();
      expect(
        toggles
          ?.map(({ name, enabled }) => ({ name, enabled }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ).toStrictEqual(
        defaultToggles
          .map(({ name, enabled }) => ({ name, enabled }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      instance.destroy();
      resolve();
    });
  });
});

test('should use the injected fetcher', async () => {
  await new Promise<void>((resolve, reject) => {
    const fetcher = new FakeFetcher({ version: 2, query: undefined, features: [] });
    const url = mockNetwork();
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url,
      backupPath: getRandomBackupPath(),
      fetcher,
    }).on('error', reject);
    instance.on('ready', () => {
      expect(instance.isEnabled('fake-feature')).toBe(false);
      instance.destroy();
      resolve();
    });
  });
});

test('should add static context fields', async () => {
  await new Promise<void>((resolve, reject) => {
    const url = mockNetwork();
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url,
      backupPath: getRandomBackupPath(),
      environment: 'prod',
      strategies: [new EnvironmentStrategy()],
    }).on('error', reject);

    instance.on('synchronized', () => {
      expect(instance.isEnabled('f-context')).toBe(true);
      instance.destroy();
      resolve();
    });
  });
});

test('should local context should take precedence over static context fields', async () => {
  await new Promise<void>((resolve, reject) => {
    const url = mockNetwork();
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url,
      backupPath: getRandomBackupPath(),
      environment: 'prod',
      strategies: [new EnvironmentStrategy()],
    }).on('error', reject);

    instance.on('ready', () => {
      expect(instance.isEnabled('f-context', { environment: 'dev' })).toBe(false);
      instance.destroy();
      resolve();
    });
  });
});

test('should call client/features with projectName query parameter if projectName is set', () => {
  const baseUrl = getUrl();
  const project = 'myProject';

  nock(baseUrl)
    .get('/client/features')
    .query({ project })
    .reply(200, { version: 2, query: undefined, features: [] });

  const instance = new Unleash({
    appName: 'foo',
    disableMetrics: true,
    skipInstanceCountWarning: true,
    backupPath: getRandomBackupPath(),
    url: baseUrl,
    projectName: project,
  });

  // @ts-expect-error
  expect(instance.repository.projectName).toEqual('myProject');

  instance.destroy();
});

test('should call client/features if no projectname set', () => {
  const baseUrl = getUrl();
  mockNetwork([], baseUrl);

  const instance = new Unleash({
    appName: 'foo',
    disableMetrics: true,
    skipInstanceCountWarning: true,
    backupPath: getRandomBackupPath(),
    url: baseUrl,
  });

  // @ts-expect-error
  expect(instance.repository.projectName).toBeUndefined();
  instance.destroy();
});

test('should distribute variants according to stickiness', async () => {
  const baseUrl = getUrl();
  nock(baseUrl)
    .get('/client/features')
    .reply(200, {
      version: 2,
      query: undefined,
      features: [
        {
          name: 'toggle-with-variants',
          enabled: true,
          strategies: [{ name: 'default' }],
          variants: [
            {
              name: 'blue',
              weight: 1,
              stickiness: 'customField',
            },
            {
              name: 'red',
              weight: 1,
              stickiness: 'customField',
            },
            {
              name: 'green',
              weight: 1,
              stickiness: 'customField',
            },
            {
              name: 'yellow',
              weight: 1,
              stickiness: 'customField',
            },
          ],
        },
      ],
    });

  const unleash = new Unleash({
    appName: 'foo-variants-1',
    disableMetrics: true,
    skipInstanceCountWarning: true,
    backupPath: getRandomBackupPath(),
    url: baseUrl,
  });

  const counts = {
    red: 0,
    blue: 0,
    green: 0,
    yellow: 0,
    sum: 0,
  };

  const genRandomValue = () => String(Math.round(Math.random() * 100000));

  await new Promise<void>((resolve) => {
    unleash.on('synchronized', () => {
      for (let i = 0; i < 10000; i++) {
        const variant = unleash.getVariant('toggle-with-variants', { someField: genRandomValue() });
        // @ts-expect-error
        counts[variant.name]++;
        counts.sum++;
      }

      const red = Math.round((counts.red / counts.sum) * 100);
      const blue = Math.round((counts.blue / counts.sum) * 100);
      const green = Math.round((counts.green / counts.sum) * 100);
      const yellow = Math.round((counts.yellow / counts.sum) * 100);

      expect(red > 23 && red < 27, `red not within range: ${red}`).toBe(true);
      expect(blue > 23 && blue < 27, `blue not within range: ${blue}`).toBe(true);
      expect(green > 23 && green < 27, `green not within range: ${green}`).toBe(true);
      expect(yellow > 23 && yellow < 27, `yellow not within range: ${yellow}`).toBe(true);
      unleash.destroy();
      resolve();
    });
  });
});

test('should distribute variants according to default stickiness', async () => {
  const baseUrl = getUrl();
  nock(baseUrl)
    .get('/client/features')
    .reply(200, {
      version: 2,
      query: undefined,
      features: [
        {
          name: 'toggle-with-variants',
          enabled: true,
          strategies: [{ name: 'default' }],
          variants: [
            {
              name: 'blue',
              weight: 1,
            },
            {
              name: 'red',
              weight: 1,
            },
            {
              name: 'green',
              weight: 1,
            },
            {
              name: 'yellow',
              weight: 1,
            },
          ],
        },
      ],
    });

  const unleash = new Unleash({
    appName: 'foo-variants-2',
    disableMetrics: true,
    skipInstanceCountWarning: true,
    backupPath: getRandomBackupPath(),
    url: baseUrl,
  });

  const counts = {
    red: 0,
    blue: 0,
    green: 0,
    yellow: 0,
    sum: 0,
  };

  const genRandomValue = () => String(Math.round(Math.random() * 100000));

  await new Promise<void>((resolve) => {
    unleash.on('synchronized', () => {
      for (let i = 0; i < 10000; i++) {
        const variant = unleash.getVariant('toggle-with-variants', { userId: genRandomValue() });
        // @ts-expect-error
        counts[variant.name]++;
        counts.sum++;
      }

      const red = Math.round((counts.red / counts.sum) * 100);
      const blue = Math.round((counts.blue / counts.sum) * 100);
      const green = Math.round((counts.green / counts.sum) * 100);
      const yellow = Math.round((counts.yellow / counts.sum) * 100);

      expect(red > 23 && red < 27, `red not within range: ${red}`).toBe(true);
      expect(blue > 23 && blue < 27, `blue not within range: ${blue}`).toBe(true);
      expect(green > 23 && green < 27, `green not within range: ${green}`).toBe(true);
      expect(yellow > 23 && yellow < 27, `yellow not within range: ${yellow}`).toBe(true);
      unleash.destroy();
      resolve();
    });
  });
});
test('should emit "synchronized" when data is received', async () => {
  await new Promise<void>((resolve, reject) => {
    const url = mockNetwork();
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url,
      backupPath: getRandomBackupPath(),
    }).on('error', reject);

    instance.on('synchronized', () => {
      expect(instance.isEnabled('feature')).toEqual(true);
      instance.destroy();
      resolve();
    });
  });
});

test('should emit "synchronized" only first time', async () => {
  await new Promise<void>((resolve, reject) => {
    let changedCount = 0;
    let synchronizedCount = 0;

    const url = getUrl();
    nock(url)
      .get('/client/features')
      .times(3)
      .reply(200, { version: 2, query: undefined, features: defaultToggles });

    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      refreshInterval: 1,
      url,
      backupPath: getRandomBackupPath(),
    }).on('error', reject);

    instance.on('changed', () => {
      changedCount += 1;
      if (changedCount > 2) {
        expect(synchronizedCount).toEqual(1);
        instance.destroy();
        resolve();
      }
    });

    instance.on('synchronized', () => {
      synchronizedCount += 1;
    });
  });
});

test('should use provided bootstrap data', async () => {
  await new Promise<void>((resolve) => {
    const url = getUrl();
    nock(url).get('/client/features').times(3).reply(500);
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url,
      backupPath: getRandomBackupPath(),
      bootstrap: {
        version: 2,
        query: undefined,
        features: {
          version: 2,
          query: undefined,
          features: [
            {
              name: 'bootstrappedToggle',
              enabled: true,
              // @ts-expect-error
              strategies: [{ name: 'default' }],
            },
          ],
        },
      },
    });

    instance.on('error', () => {});

    instance.on('ready', () => {
      expect(instance.isEnabled('bootstrappedToggle')).toBe(true);
      instance.destroy();
      resolve();
    });
  });
});

test('should emit impression events for isEnabled', async () => {
  const baseUrl = getUrl();
  nock(baseUrl)
    .get('/client/features')
    .reply(200, {
      version: 2,
      query: undefined,
      features: [
        {
          name: 'toggle-impressions',
          enabled: true,
          strategies: [{ name: 'default' }],
          impressionData: true,
          variants: [
            {
              name: 'blue',
              weight: 1,
            },
            {
              name: 'red',
              weight: 1,
            },
            {
              name: 'green',
              weight: 1,
            },
            {
              name: 'yellow',
              weight: 1,
            },
          ],
        },
      ],
    });

  const unleash = new Unleash({
    appName: 'foo-variants-3',
    disableMetrics: true,
    skipInstanceCountWarning: true,
    backupPath: getRandomBackupPath(),
    url: baseUrl,
  });

  const context = { userId: '123', properties: { tenantId: 't12' } };

  await new Promise<void>((resolve) => {
    unleash.on('impression', (evt) => {
      expect(evt.featureName).toEqual('toggle-impressions');
      expect(evt.enabled).toEqual(true);
      expect(evt.eventType).toEqual('isEnabled');
      expect(evt.context.userId).toEqual(context.userId);
      expect(evt.context.properties).toStrictEqual(context.properties);
      unleash.destroy();
      resolve();
    });

    unleash.on('synchronized', () => {
      unleash.isEnabled('toggle-impressions', context);
    });
  });
});

test('should emit impression events for getVariant', async () => {
  const baseUrl = getUrl();
  nock(baseUrl)
    .get('/client/features')
    .reply(200, {
      version: 2,
      query: undefined,
      features: [
        {
          name: 'toggle-impressions',
          enabled: true,
          strategies: [{ name: 'default' }],
          impressionData: true,
          variants: [
            {
              name: 'blue',
              weight: 1,
            },
            {
              name: 'red',
              weight: 1,
            },
            {
              name: 'green',
              weight: 1,
            },
            {
              name: 'yellow',
              weight: 1,
            },
          ],
        },
      ],
    });

  const unleash = new Unleash({
    appName: 'foo-variants-4',
    disableMetrics: true,
    skipInstanceCountWarning: true,
    backupPath: getRandomBackupPath(),
    url: baseUrl,
  });

  const context = { userId: '123', properties: { tenantId: 't12' } };

  await new Promise<void>((resolve) => {
    unleash.on('impression', (evt) => {
      expect(evt.featureName).toEqual('toggle-impressions');
      expect(evt.enabled).toEqual(true);
      expect(evt.eventType).toEqual('getVariant');
      expect(evt.variant).toEqual('yellow');
      expect(evt.context.userId).toEqual(context.userId);
      expect(evt.context.properties).toStrictEqual(context.properties);
      unleash.destroy();
      resolve();
    });

    unleash.on('synchronized', () => {
      unleash.getVariant('toggle-impressions', context);
    });
  });
});

test('should only instantiate once', () => {
  const baseUrl = `${getUrl()}api`;
  mockNetwork([], baseUrl);

  const i1 = Unleash.getInstance({
    appName: 'get-instance-1',
    skipInstanceCountWarning: true,
    refreshInterval: 0,
    disableMetrics: true,
    url: baseUrl,
  });
  const i2 = Unleash.getInstance({
    appName: 'get-instance-1',
    skipInstanceCountWarning: true,
    refreshInterval: 0,
    disableMetrics: true,
    url: baseUrl,
  });

  expect(i1).toEqual(i2);

  i1.destroy();
  i2.destroy();
});

test('should throw when getInstantiate called with different unleash-config ', () => {
  const baseUrl = `${getUrl()}api`;
  mockNetwork([], baseUrl);

  const i1 = Unleash.getInstance({
    appName: 'get-instance-1',
    refreshInterval: 0,
    disableMetrics: true,
    skipInstanceCountWarning: true,
    url: baseUrl,
  });

  expect(() =>
    Unleash.getInstance({
      appName: 'get-instance-2',
      refreshInterval: 0,
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url: baseUrl,
    }),
  ).toThrow();

  i1.destroy();
});

const metricsCapturingUnleash = async (input: unknown) => {
  const url = getUrl();
  const fetcher = new FakeFetcher({
    version: 2,
    query: undefined,
    features: [input as ClientFeatures['features'][number]],
  });
  const instance = new Unleash({
    skipInstanceCountWarning: true,
    appName: 'foo',
    fetcher,
    disableAutoStart: true,
    metricsInterval: 0,
    url,
  });
  nock(url).post('/client/metrics').reply(200);
  await instance.start();
  const capturedData: MetricsData[] = [];
  instance.on(UnleashEvents.Sent, (data) => {
    capturedData.push(data);
  });
  return { instance, capturedData };
};

test('should report variant metrics', async () => {
  const { instance, capturedData } = await metricsCapturingUnleash({
    name: 'toggle-with-variants',
    enabled: true,
    strategies: [{ name: 'default', constraints: [] }],
    variants: [
      { name: 'toggle-variant', weight: 1000, payload: { type: 'string', value: 'variant value' } },
    ],
  });

  instance.getVariant('toggle-with-variants');

  await instance.destroyWithFlush();
  expect(capturedData[0].bucket?.toggles).toStrictEqual({
    'toggle-with-variants': {
      yes: 1,
      no: 0,
      variants: { 'toggle-variant': 1 },
    },
  });
});

test('should report disabled variant metrics', async () => {
  const { instance, capturedData } = await metricsCapturingUnleash({
    name: 'toggle-without-variants',
    enabled: true,
    strategies: [{ name: 'default', constraints: [] }],
    variants: [],
  });

  instance.getVariant('toggle-without-variants');

  await instance.destroyWithFlush();
  expect(capturedData[0].bucket?.toggles).toStrictEqual({
    'toggle-without-variants': {
      yes: 1,
      no: 0,
      variants: { disabled: 1 },
    },
  });
});

test('should report disabled toggle metrics', async () => {
  const { instance, capturedData } = await metricsCapturingUnleash({
    name: 'disabled-toggle',
    enabled: false,
    strategies: [{ name: 'default', constraints: [] }],
    variants: [],
  });

  instance.getVariant('disabled-toggle');

  await instance.destroyWithFlush();
  expect(capturedData[0].bucket?.toggles).toStrictEqual({
    'disabled-toggle': {
      yes: 0,
      no: 1,
      variants: { disabled: 1 },
    },
  });
});

test('should not report dependent feature metrics', async () => {
  const { instance, capturedData } = await metricsCapturingUnleash({
    name: 'toggle-with-dependency',
    enabled: true,
    dependencies: [{ feature: 'dependency' }],
    strategies: [{ name: 'default', constraints: [] }],
    variants: [
      { name: 'toggle-variant', weight: 1000, payload: { type: 'string', value: 'variant value' } },
    ],
  });

  instance.getVariant('toggle-with-dependency');
  instance.isEnabled('toggle-with-dependency');
  instance.isEnabled('dependency');

  await instance.destroyWithFlush();
  expect(capturedData[0].bucket?.toggles).toStrictEqual({
    'toggle-with-dependency': {
      yes: 0,
      no: 2, // one enabled and one variant check
      variants: { disabled: 1 },
    },
    dependency: {
      yes: 0,
      no: 1, // direct call, no transitive calls
      variants: {},
    },
  });
});

test('should emit correctly formatted warn for isEnabled before initialized', () => {
  const url = mockNetwork();
  const instance = new Unleash({
    appName: 'foo',
    disableMetrics: true,
    skipInstanceCountWarning: true,
    url,
    backupPath: getRandomBackupPath(),
  });

  const warnings: string[] = [];
  instance.on('warn', (msg) => warnings.push(msg));

  expect(instance.isEnabled('my-feature')).toBe(false);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("isEnabled('my-feature')");
  expect(warnings[0]).toContain('false');

  instance.destroy();
});

test('should emit correctly serialized warn for getVariant before initialized', () => {
  const url = mockNetwork();
  const instance = new Unleash({
    appName: 'foo',
    disableMetrics: true,
    skipInstanceCountWarning: true,
    url,
    backupPath: getRandomBackupPath(),
  });

  const warnings: string[] = [];
  instance.on('warn', (msg) => warnings.push(msg));

  instance.getVariant('my-feature');
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("getVariant('my-feature')");
  expect(warnings[0]).not.toContain('[object Object]');
  expect(warnings[0]).toContain('"name":"disabled"');

  instance.destroy();
});

test('should not allow to start twice', async () => {
  const url = mockNetwork();
  const fetcher = new FakeFetcher();
  const instance = new Unleash({
    appName: 'foo',
    disableMetrics: true,
    skipInstanceCountWarning: true,
    url,
    backupPath: getRandomBackupPath(),
    fetcher,
  });

  await instance.start();
  await instance.start();

  expect(fetcher.starts).toEqual(1);
  instance.destroy();
});
