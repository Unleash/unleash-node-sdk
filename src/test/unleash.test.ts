import test from './test-shim';
import * as nock from 'nock';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirp } from 'mkdirp';
import * as sinon from 'sinon';
import FakeRepo from './fake_repo';

import { Strategy, Unleash, UnleashEvents } from '../unleash';
import { InMemStorageProvider } from '..';
import { RepositoryInterface } from '../repository';

class EnvironmentStrategy extends Strategy {
  constructor() {
    super('EnvironmentStrategy');
  }

  // @ts-expect-error
  isEnabled(parameters, context) {
    return parameters.environments.indexOf(context.environment) !== -1;
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
    .reply(200, { features: toggles });
  return url;
}

test('should error when missing url', (t) => {
  // @ts-expect-error
  t.throws(() => new Unleash({ skipInstanceCountWarning: true }));
  // @ts-expect-error
  t.throws(() => new Unleash({ url: false, skipInstanceCountWarning: true }));
  t.throws(
    () =>
      new Unleash({
        url: 'http://unleash.github.io',
        // @ts-expect-error
        appName: false,
        skipInstanceCountWarning: true,
      }),
  );
});

test('calling destroy synchronously should avoid network activity', (t) => {
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
  t.true(true);
});

test('should handle old url', (t) =>
  new Promise((resolve) => {
    const url = mockNetwork([]);

    const instance = new Unleash({
      appName: 'foo',
      refreshInterval: 0,
      metricsInterval: 0,
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url: `${url}features`,
    });

    t.plan(1);
    instance.on('warn', (e) => {
      t.truthy(e);
      resolve();
    });

    instance.destroy();
  }));

test('should handle url without ending /', (t) => {
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
  t.true(`${baseUrl}/` === instance.repository.url);
  // @ts-expect-error
  t.true(`${baseUrl}/` === instance.metrics.url);

  instance.destroy();
});

test('should re-emit error from repository and metrics', (t) => {
  const url = mockNetwork([]);

  const instance = new Unleash({
    appName: 'foo',
    refreshInterval: 0,
    metricsInterval: 0,
    disableMetrics: true,
    skipInstanceCountWarning: true,
    url,
  });

  t.plan(2);
  instance.on('error', (e) => {
    t.truthy(e);
  });
  // @ts-expect-error
  instance.repository.emit('error', new Error());
  // @ts-expect-error
  instance.metrics.emit('error', new Error());

  instance.destroy();
});

test('should re-emit events from repository and metrics', (t) => {
  const url = mockNetwork();
  const instance = new Unleash({
    appName: 'foo',
    refreshInterval: 0,
    disableMetrics: true,
    skipInstanceCountWarning: true,
    url,
  });

  t.plan(7);
  instance.on(UnleashEvents.Warn, (e) => t.truthy(e));
  instance.on(UnleashEvents.Sent, (e) => t.truthy(e));
  instance.on(UnleashEvents.Registered, (e) => t.truthy(e));
  instance.on(UnleashEvents.Count, (e) => t.truthy(e));
  instance.on(UnleashEvents.Unchanged, (e) => t.truthy(e));
  instance.on(UnleashEvents.Changed, (e) => t.truthy(e));

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
  // @ts-expect-error
  instance.metrics.emit(UnleashEvents.Count, true);

  instance.destroy();
});

test('repository should surface error when invalid basePath', (t) =>
  new Promise((resolve) => {
    const url = 'http://unleash-surface.app/';
    nock(url).get('/client/features').delay(100).reply(200, { features: [] });
    const backupPath = join(tmpdir(), `test-tmp-${Math.round(Math.random() * 100000)}`);
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url: `${url}bougus`,
      backupPath,
    });

    instance.once('error', (err) => {
      t.truthy(err);
      t.is(err.code, 'ERR_NOCK_NO_MATCH');

      instance.destroy();

      resolve();
    });
  }));

test('should allow request even before unleash is initialized', (t) => {
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
  t.true(instance.isEnabled('unknown') === false);
  instance.destroy();
});

test('should consider known feature-toggle as active', (t) =>
  new Promise((resolve, reject) => {
    const url = mockNetwork();
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url,
      backupPath: getRandomBackupPath(),
    }).on('error', reject);

    instance.on('synchronized', () => {
      t.true(instance.isEnabled('feature') === true);
      instance.destroy();
      resolve();
    });
  }));

test('should consider unknown feature-toggle as disabled', (t) =>
  new Promise((resolve, reject) => {
    const url = mockNetwork();
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url,
      backupPath: getRandomBackupPath(),
    }).on('error', reject);

    instance.on('synchronized', () => {
      t.true(instance.isEnabled('unknown') === false);
      instance.destroy();
      resolve();
    });
  }));

test('should return fallback value until online', (t) =>
  new Promise((resolve, reject) => {
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

    t.true(instance.isEnabled('feature') === false);
    t.is(warnCounter, 1);
    t.true(instance.isEnabled('feature', {}, false) === false);
    t.true(instance.isEnabled('feature', {}, true) === true);
    t.is(warnCounter, 3);

    instance.on('synchronized', () => {
      t.true(instance.isEnabled('feature') === true);
      t.true(instance.isEnabled('feature', {}, false) === true);
      instance.destroy();
      resolve();
    });
  }));

test('should call fallback function for unknown feature-toggle', (t) =>
  new Promise((resolve, reject) => {
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
      const fallbackFunc = sinon.spy(() => false); // eslint-disable-line import/namespace
      const name = 'unknown';
      const result = instance.isEnabled(name, { userId: '123' }, fallbackFunc);
      t.true(result === false);
      t.true(fallbackFunc.called);
      t.true(
        // @ts-expect-error
        fallbackFunc.firstCall.calledWith(name, {
          appName: 'foo',
          environment: 'test',
          userId: '123',
        }),
      );
      instance.destroy();
      resolve();
    });
  }));

test('should not throw when os.userInfo throws', (t) => {
  t.plan(0);

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line global-require
    require('os').userInfo = () => {
      throw new Error('Test exception');
    };
    const url = mockNetwork();
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url,
      backupPath: getRandomBackupPath(),
    }).on('error', reject);

    instance.on('synchronized', () => {
      resolve();
    });
  });
});

test('should return known feature-toggle definition', (t) =>
  new Promise((resolve, reject) => {
    const url = mockNetwork();
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url,
      backupPath: getRandomBackupPath(),
    }).on('error', reject);

    instance.on('synchronized', () => {
      const toggle = instance.getFeatureToggleDefinition('feature');
      t.truthy(toggle);
      instance.destroy();
      resolve();
    });
  }));

test('should return feature-toggles', (t) =>
  new Promise((resolve, reject) => {
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
      t.deepEqual(toggles, defaultToggles);
      instance.destroy();
      resolve();
    });
  }));

test('returns undefined for unknown feature-toggle definition', (t) =>
  new Promise((resolve, reject) => {
    const url = mockNetwork();
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url,
      backupPath: getRandomBackupPath(),
    }).on('error', reject);

    instance.on('synchronized', () => {
      const toggle = instance.getFeatureToggleDefinition('unknown');
      t.falsy(toggle);
      instance.destroy();
      resolve();
    });
  }));

test('should use the injected repository', (t) =>
  new Promise((resolve, reject) => {
    // @ts-expect-error
    const repo = new FakeRepo();
    const url = mockNetwork();
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url,
      backupPath: getRandomBackupPath(),
      // @ts-expect-error
      repository: repo,
    }).on('error', reject);
    instance.on('ready', () => {
      t.false(instance.isEnabled('fake-feature'));
      instance.destroy();
      resolve();
    });
    repo.emit('ready');
  }));

test('should add static context fields', (t) =>
  new Promise((resolve, reject) => {
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
      t.true(instance.isEnabled('f-context') === true);
      instance.destroy();
      resolve();
    });
  }));

test('should local context should take precedence over static context fields', (t) =>
  new Promise((resolve, reject) => {
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
      t.true(instance.isEnabled('f-context', { environment: 'dev' }) === false);
      instance.destroy();
      resolve();
    });
  }));

test('should call client/features with projectName query parameter if projectName is set', (t) => {
  const baseUrl = getUrl();
  const project = 'myProject';

  nock(baseUrl).get('/client/features').query({ project }).reply(200, { features: [] });

  const instance = new Unleash({
    appName: 'foo',
    disableMetrics: true,
    skipInstanceCountWarning: true,
    backupPath: getRandomBackupPath(),
    url: baseUrl,
    projectName: project,
  });

  // @ts-expect-error
  t.assert(instance.repository.projectName === 'myProject');

  instance.destroy();
});

test('should call client/features if no projectname set', (t) => {
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
  t.assert(instance.repository.projectName === undefined);
  instance.destroy();
});

test('should distribute variants according to stickiness', async (t) => {
  const baseUrl = getUrl();
  nock(baseUrl)
    .get('/client/features')
    .reply(200, {
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

  return new Promise((resolve) => {
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

      t.true(red > 23 && red < 27, `red not within range: ${red}`);
      t.true(blue > 23 && blue < 27, `blue not within range: ${blue}`);
      t.true(green > 23 && green < 27, `green not within range: ${green}`);
      t.true(yellow > 23 && yellow < 27, `yellow not within range: ${yellow}`);
      unleash.destroy();
      resolve();
    });
  });
});

test('should distribute variants according to default stickiness', async (t) => {
  const baseUrl = getUrl();
  nock(baseUrl)
    .get('/client/features')
    .reply(200, {
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

  return new Promise((resolve) => {
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

      t.true(red > 23 && red < 27, `red not within range: ${red}`);
      t.true(blue > 23 && blue < 27, `blue not within range: ${blue}`);
      t.true(green > 23 && green < 27, `green not within range: ${green}`);
      t.true(yellow > 23 && yellow < 27, `yellow not within range: ${yellow}`);
      unleash.destroy();
      resolve();
    });
  });
});
test('should emit "synchronized" when data is received', (t) =>
  new Promise((resolve, reject) => {
    const url = mockNetwork();
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url,
      backupPath: getRandomBackupPath(),
    }).on('error', reject);

    instance.on('synchronized', () => {
      t.is(instance.isEnabled('feature'), true);
      instance.destroy();
      resolve();
    });
  }));

test('should emit "synchronized" only first time', (t) =>
  new Promise((resolve, reject) => {
    let changedCount = 0;
    let synchronizedCount = 0;

    const url = getUrl();
    nock(url).get('/client/features').times(3).reply(200, { features: defaultToggles });

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
        t.is(synchronizedCount, 1);
        instance.destroy();
        resolve();
      }
    });

    instance.on('synchronized', () => {
      synchronizedCount += 1;
    });
  }));

test('should use provided bootstrap data', (t) =>
  new Promise((resolve) => {
    const url = getUrl();
    nock(url).get('/client/features').times(3).reply(500);
    const instance = new Unleash({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url,
      backupPath: getRandomBackupPath(),
      bootstrap: {
        data: [
          {
            name: 'bootstrappedToggle',
            enabled: true,
            // @ts-expect-error
            strategies: [{ name: 'default' }],
          },
        ],
      },
    });

    instance.on('error', () => {});

    instance.on('ready', () => {
      t.true(instance.isEnabled('bootstrappedToggle') === true);
      instance.destroy();
      resolve();
    });
  }));

test('should emit impression events for isEnabled', async (t) => {
  const baseUrl = getUrl();
  nock(baseUrl)
    .get('/client/features')
    .reply(200, {
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

  return new Promise((resolve) => {
    unleash.on('impression', (evt) => {
      t.is(evt.featureName, 'toggle-impressions');
      t.is(evt.enabled, true);
      t.is(evt.eventType, 'isEnabled');
      t.is(evt.context.userId, context.userId);
      t.deepEqual(evt.context.properties, context.properties);
      unleash.destroy();
      resolve();
    });

    unleash.on('synchronized', () => {
      unleash.isEnabled('toggle-impressions', context);
    });
  });
});

test('should emit impression events for getVariant', async (t) => {
  const baseUrl = getUrl();
  nock(baseUrl)
    .get('/client/features')
    .reply(200, {
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

  return new Promise((resolve) => {
    unleash.on('impression', (evt) => {
      t.is(evt.featureName, 'toggle-impressions');
      t.is(evt.enabled, true);
      t.is(evt.eventType, 'getVariant');
      t.is(evt.variant, 'yellow');
      t.is(evt.context.userId, context.userId);
      t.deepEqual(evt.context.properties, context.properties);
      unleash.destroy();
      resolve();
    });

    unleash.on('synchronized', () => {
      unleash.getVariant('toggle-impressions', context);
    });
  });
});

test('should only instantiate once', (t) => {
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

  t.is(i1, i2);

  i1.destroy();
  i2.destroy();
});

test('should throw when getInstantiate called with different unleash-config ', (t) => {
  const baseUrl = `${getUrl()}api`;
  mockNetwork([], baseUrl);

  const i1 = Unleash.getInstance({
    appName: 'get-instance-1',
    refreshInterval: 0,
    disableMetrics: true,
    skipInstanceCountWarning: true,
    url: baseUrl,
  });

  t.throws(() =>
    Unleash.getInstance({
      appName: 'get-instance-2',
      refreshInterval: 0,
      disableMetrics: true,
      skipInstanceCountWarning: true,
      url: baseUrl,
    }),
  );

  i1.destroy();
});

test('should allow custom repository', (t) =>
  new Promise((resolve) => {
    const url = getUrl();

    const instance = Unleash.getInstance({
      appName: 'foo',
      disableMetrics: true,
      skipInstanceCountWarning: true,
      refreshInterval: 0,
      url,
      backupPath: getRandomBackupPath(),
      bootstrap: {
        data: [
          {
            name: 'bootstrappedToggle',
            enabled: true,
            // @ts-expect-error
            strategies: [{ name: 'default' }],
          },
        ],
      },
      storageProvider: new InMemStorageProvider(),
      repository: {
        // @ts-expect-error
        getToggle: () => ({ name: 'test', enabled: true, strategies: [{ name: 'default' }] }),
        getToggles: () => [],
        getSegment: () => undefined,
        stop: () => {},
        // @ts-expect-error
        start: () => {
          setInterval(() => {}, 1000);
        },
        // @ts-expect-error
        on: (evt, fun) => {
          if (evt === 'ready') {
            setTimeout(() => fun(), 100);
          }
        },
      },
    });

    instance.on('error', () => {});

    instance.on('ready', () => {
      t.true(instance.isEnabled('test') === true);
      instance.destroy();
      resolve();
    });
  }));

const metricsCapturingUnleash = (input: any) => {
  const url = getUrl();
  const repository = new FakeRepo(input);
  const instance = new Unleash({
    skipInstanceCountWarning: true,
    appName: 'foo',
    metricsInterval: 10,
    // @ts-expect-error
    repository,
    url,
  });
  nock(url).post('/client/metrics').reply(200);
  repository.emit(UnleashEvents.Ready);
  // @ts-expect-error
  const capturedData = [];
  instance.on(UnleashEvents.Sent, (data) => {
    capturedData.push(data);
  });
  // @ts-expect-error
  return { instance, capturedData };
};

test('should report variant metrics', async (t) => {
  const { instance, capturedData } = metricsCapturingUnleash({
    name: 'toggle-with-variants',
    enabled: true,
    strategies: [{ name: 'default', constraints: [] }],
    variants: [{ name: 'toggle-variant', payload: { type: 'string', value: 'variant value' } }],
  });

  instance.getVariant('toggle-with-variants');

  await instance.destroyWithFlush();
  t.deepEqual(capturedData[0].bucket.toggles, {
    'toggle-with-variants': {
      yes: 1,
      no: 0,
      variants: { 'toggle-variant': 1 },
    },
  });
});

test('should report disabled variant metrics', async (t) => {
  const { instance, capturedData } = metricsCapturingUnleash({
    name: 'toggle-without-variants',
    enabled: true,
    strategies: [{ name: 'default', constraints: [] }],
    variants: [],
  });

  instance.getVariant('toggle-without-variants');

  await instance.destroyWithFlush();
  t.deepEqual(capturedData[0].bucket.toggles, {
    'toggle-without-variants': {
      yes: 1,
      no: 0,
      variants: { disabled: 1 },
    },
  });
});

test('should report disabled toggle metrics', async (t) => {
  const { instance, capturedData } = metricsCapturingUnleash({
    name: 'disabled-toggle',
    enabled: false,
    strategies: [{ name: 'default', constraints: [] }],
    variants: [],
  });

  instance.getVariant('disabled-toggle');

  await instance.destroyWithFlush();
  t.deepEqual(capturedData[0].bucket.toggles, {
    'disabled-toggle': {
      yes: 0,
      no: 1,
      variants: { disabled: 1 },
    },
  });
});

test('should not report dependent feature metrics', async (t) => {
  const { instance, capturedData } = metricsCapturingUnleash({
    name: 'toggle-with-dependency',
    enabled: true,
    dependencies: [{ feature: 'dependency' }],
    strategies: [{ name: 'default', constraints: [] }],
    variants: [{ name: 'toggle-variant', payload: { type: 'string', value: 'variant value' } }],
  });

  instance.getVariant('toggle-with-dependency');
  instance.isEnabled('toggle-with-dependency');
  instance.isEnabled('dependency');

  await instance.destroyWithFlush();
  t.deepEqual(capturedData[0].bucket.toggles, {
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

test('should not allow to start twice', async (t) => {
  const url = mockNetwork();
  let repositoryStartedCount = 0;
  const mockRepository = {
    on() {},
    start() {
      repositoryStartedCount++;
    },
  } as unknown as RepositoryInterface;
  const instance = new Unleash({
    appName: 'foo',
    disableMetrics: true,
    skipInstanceCountWarning: true,
    url,
    backupPath: getRandomBackupPath(),
    repository: mockRepository,
  });

  await instance.start();
  await instance.start();

  t.is(repositoryStartedCount, 1);
});
