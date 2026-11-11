import { EventEmitter } from 'node:events';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type ClientFeatures,
  type ClientFeaturesDelta,
  getSpecVersion,
  UnleashEngine,
} from '@unleash/yggdrasil-engine';
import nock from 'nock';
import { afterEach, assert, expect, test, vi } from 'vitest';
import { AdaptiveFetcher } from '../../repository/adaptive-fetcher';

type DeltaEvent = ClientFeaturesDelta['events'][number];
type ClientFeaturesResponse = ClientFeatures;

import Repository from '../../repository';
import { DefaultBootstrapProvider } from '../../repository/bootstrap-provider';
import type { StorageProvider } from '../../repository/storage-provider';
import FileStorageProvider from '../../repository/storage-provider-file';
import InMemStorageProvider from '../../repository/storage-provider-in-mem';

const appName = 'foo';
const instanceId = 'bar';
const connectionId = 'baz';

const activeRepositories: Repository[] = [];
const engines = new Map<Repository, UnleashEngine>();
const fetchers = new Map<Repository, AdaptiveFetcher>();
function engineFor(repository: Repository): UnleashEngine {
  const engine = engines.get(repository);
  if (!engine) throw new Error('Repository engine missing from fixture');
  return engine;
}
function fetcherFor(repository: Repository): AdaptiveFetcher {
  const fetcher = fetchers.get(repository);
  if (!fetcher) throw new Error('Repository fetcher missing from fixture');
  return fetcher;
}
function newRepository(
  options: Omit<ConstructorParameters<typeof Repository>[0], 'engine'>,
): Repository {
  const engine = new UnleashEngine();
  const fetcher = new AdaptiveFetcher({ ...options, specVersion: getSpecVersion() });
  const repository = new Repository({ ...options, engine, fetcher });
  engines.set(repository, engine);
  fetchers.set(repository, fetcher);
  activeRepositories.push(repository);
  return repository;
}

// biome-ignore lint/suspicious/noExplicitAny: be relaxed in tests
function setup(url: string, toggles: any[], headers: Record<string, string> = {}) {
  return nock(url)
    .persist()
    .get('/client/features')
    .reply(200, { version: 2, query: undefined, features: toggles }, headers);
}

function createMockEventSource() {
  const eventSource = {
    eventEmitter: new EventEmitter(),
    listeners: new Set<string>(),
    addEventListener(eventName: string, handler: () => void) {
      eventSource.listeners.add(eventName);
      eventSource.eventEmitter.on(eventName, handler);
    },
    close() {
      eventSource.listeners.forEach((eventName: string) => {
        eventSource.eventEmitter.removeAllListeners(eventName);
      });
      eventSource.closed = true;
    },
    closed: false,
    emit(eventName: string, data: unknown) {
      eventSource.eventEmitter.emit(eventName, data);
    },
  };
  return eventSource as unknown as EventSource & {
    closed: boolean;
    emit: (eventName: string, data: unknown) => void;
  };
}

function createSSEResponse(events: Array<{ event: string; data: unknown }>) {
  let eventId = 0;
  return events
    .map((e) => {
      const dataStr = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
      return `event: ${e.event}\ndata: ${dataStr}\nid: ${eventId++}\n\n`;
    })
    .join('');
}

afterEach(() => {
  // Stop any repositories the test left running so their timers don't fire into later tests
  for (const repository of activeRepositories.splice(0)) {
    repository.stop();
    engineFor(repository).destroy();
  }
  engines.clear();
  fetchers.clear();
  nock.cleanAll();
});

test('should fetch from endpoint', async () => {
  const url = 'http://unleash-test-0.app';
  const feature = {
    name: 'feature',
    enabled: true,
    strategies: [
      {
        name: 'default',
      },
    ],
  };

  setup(url, [feature]);
  const repo = newRepository({
    url,
    appName,
    instanceId,
    connectionId,
    refreshInterval: 10,
    bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
    storageProvider: new InMemStorageProvider(),
    mode: { type: 'polling', format: 'full' },
  });

  await new Promise<void>((resolve, reject) => {
    repo.once('changed', () => {
      const savedFeature = engineFor(repo)
        .getState()
        .features.find((entry) => entry.name === feature.name);
      expect(savedFeature?.enabled).toBe(feature.enabled);
      expect(savedFeature?.strategies?.[0].name).toBe(feature.strategies[0].name);

      const featureToggles = engineFor(repo).getState().features;
      expect(featureToggles[0].name).toBe('feature');

      resolve();
    });

    // Optional: surface repo errors in the test
    repo.once('error', (err: unknown) => {
      reject(err);
    });

    repo.start();
  });
});

test('should poll for changes', async () => {
  const url = 'http://unleash-test-2.app';
  setup(url, []);
  const repo = newRepository({
    url,
    appName,
    instanceId,
    connectionId,
    refreshInterval: 10,
    bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
    storageProvider: new InMemStorageProvider(),
    mode: { type: 'polling', format: 'full' },
  });
  await new Promise<void>((resolve, reject) => {
    let assertCount = 5;
    repo.on('unchanged', resolve);
    repo.on('changed', () => {
      assertCount--;

      if (assertCount === 0) {
        repo.stop();
        expect(assertCount).toBe(0);
        resolve();
      }
    });

    repo.on('error', reject);
    repo.start();
  });
});

test('should retry even if custom header function fails', async () =>
  await new Promise<void>((resolve) => {
    const url = 'http://unleash-test-2-custom-headers.app';
    setup(url, []);
    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      refreshInterval: 10,
      customHeadersFunction: () => {
        throw new Error('custom function fails');
      },
      bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
      storageProvider: new InMemStorageProvider(),
      mode: { type: 'polling', format: 'full' },
    });

    let assertCount = 2;
    repo.on('error', (error) => {
      if (error.message === 'custom function fails') {
        assertCount--;
      }
      if (assertCount === 0) {
        repo.stop();
        expect(assertCount).toBe(0);
        resolve();
      }
    });
    repo.start();
  }));

test('should store etag', async () => {
  await new Promise<void>((resolve) => {
    const url = 'http://unleash-test-3.app';
    setup(url, [], { Etag: '12345' });
    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      refreshInterval: 10,
      bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
      storageProvider: new InMemStorageProvider(),
      mode: { type: 'polling', format: 'full' },
    });

    repo.once('unchanged', resolve);
    repo.once('changed', () => {
      expect(fetcherFor(repo).getEtag()).toBe('12345');

      resolve();
    });
    repo.start();
  });
});

test('should request with etag', async () => {
  await new Promise<void>((resolve) => {
    expect.assertions(1);
    const url = 'http://unleash-test-4.app';
    nock(url)
      .matchHeader('If-None-Match', '12345-1')
      .persist()
      .get('/client/features')
      .reply(200, { version: 2, query: undefined, features: [] }, { Etag: '12345-2' });
    nock(url).matchHeader('If-None-Match', '12345-2').persist().get('/client/features').reply(304);

    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      refreshInterval: 10,
      bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
      storageProvider: new InMemStorageProvider(),
      mode: { type: 'polling', format: 'full' },
    });

    fetcherFor(repo).setEtag('12345-1');
    repo.once('unchanged', () => {
      resolve();
    });
    repo.once('changed', () => {
      expect(fetcherFor(repo).getEtag()).toBe('12345-2');
    });
    repo.start();
  });
});

test('should request with correct custom and unleash headers', async () => {
  await new Promise<void>((resolve) => {
    const url = 'http://unleash-test-4-x.app';
    const randomKey = `random-${Math.random()}`;
    nock(url)
      .matchHeader('randomKey', randomKey)
      .matchHeader('unleash-appname', appName)
      .matchHeader('unleash-connection-id', connectionId)
      .matchHeader('unleash-interval', '10')
      .matchHeader('unleash-sdk', /^unleash-node-sdk:\d+\.\d+\.\d+/)
      .persist()
      .get('/client/features')
      .reply(200, { version: 2, query: undefined, features: [] }, { Etag: '12345-3' });

    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      refreshInterval: 10,
      bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
      storageProvider: new InMemStorageProvider(),
      headers: {
        randomKey,
        'unleash-connection-id': 'ignore',
        'unleash-interval': 'ignore',
      },
      mode: { type: 'polling', format: 'full' },
    });

    fetcherFor(repo).setEtag('12345-1');
    repo.once('unchanged', () => {
      resolve();
    });
    repo.once('changed', () => {
      expect(fetcherFor(repo).getEtag()).toEqual('12345-3');
      resolve();
    });
    repo.start();
  });
});

test('request with customHeadersFunction should take precedence over customHeaders', async () => {
  await new Promise<void>((resolve) => {
    const url = 'http://unleash-test-4-x.app';
    const randomKey = `random-${Math.random()}`;
    const customHeaderKey = `customer-${Math.random()}`;
    nock(url)
      .matchHeader('customHeaderKey', customHeaderKey)
      .matchHeader('randomKey', (value) => value === undefined)
      .persist()
      .get('/client/features')
      .reply(200, { version: 2, query: undefined, features: [] }, { Etag: '12345-3' });

    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      refreshInterval: 10,
      bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
      storageProvider: new InMemStorageProvider(),
      headers: {
        randomKey,
      },
      customHeadersFunction: () => Promise.resolve({ customHeaderKey }),
      mode: { type: 'polling', format: 'full' },
    });

    fetcherFor(repo).setEtag('12345-1');
    repo.once('unchanged', () => {
      resolve();
    });
    repo.once('changed', () => {
      expect(fetcherFor(repo).getEtag()).toEqual('12345-3');
      resolve();
    });
    repo.start();
  });
});

test('should handle 429 request error and emit warn event', async () => {
  const url = 'http://unleash-test-6-429.app';
  nock(url).persist().get('/client/features').reply(429, 'blabla');
  const repo = newRepository({
    url,
    appName,
    instanceId,
    connectionId,
    refreshInterval: 1000,
    bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
    storageProvider: new InMemStorageProvider(),
    mode: { type: 'polling', format: 'full' },
  });
  const warning = new Promise<void>((resolve) => {
    repo.on('warn', (warn) => {
      expect(warn).toEqual(
        `${url}/client/features responded TOO_MANY_CONNECTIONS (429). Backing off`,
      );
      expect(fetcherFor(repo).nextFetch()).toBe(1000 + fetcherFor(repo).getFailures() * 1000);
      resolve();
    });
  });
  await repo.start();
  await vi.waitFor<void>(() => warning, { timeout: 5000 });
});

test('should handle 401 request error and emit error event', async () => {
  await new Promise<void>((resolve) => {
    const url = 'http://unleash-test-6-401.app';
    nock(url).persist().get('/client/features').reply(401, 'blabla');
    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      refreshInterval: 10,
      bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
      storageProvider: new InMemStorageProvider(),
      mode: { type: 'polling', format: 'full' },
    });
    repo.on('error', (err) => {
      expect(err).toBeTruthy();
      expect(err.message).toEqual(
        `${url}/client/features responded 401 which means your API key is not allowed to connect. Stopping refresh of toggles`,
      );
      resolve();
    });
    repo.start();
  });
});

test('should handle 403 request error and emit error event', async () =>
  await new Promise<void>((resolve) => {
    const url = 'http://unleash-test-6-403.app';
    nock(url).persist().get('/client/features').reply(403, 'blabla');
    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      refreshInterval: 10,
      bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
      storageProvider: new InMemStorageProvider(),
      mode: { type: 'polling', format: 'full' },
    });
    repo.on('error', (err) => {
      expect(err).toBeTruthy();
      expect(err.message).toEqual(
        `${url}/client/features responded 403 which means your API key is not allowed to connect. Stopping refresh of toggles`,
      );
      resolve();
    });
    repo.start();
  }));

test('should handle 500 request error and emit warn event', () =>
  new Promise<void>((resolve) => {
    const url = 'http://unleash-test-6-500.app';
    nock(url).persist().get('/client/features').reply(500, 'blabla');
    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      refreshInterval: 10,
      bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
      storageProvider: new InMemStorageProvider(),
      mode: { type: 'polling', format: 'full' },
    });
    repo.on('warn', (warn) => {
      expect(warn).toBeTruthy();
      expect(warn).toEqual(`${url}/client/features responded 500. Backing off`);
      resolve();
    });
    repo.start();
  }));

test('should handle 502 request error and emit warn event', () =>
  new Promise<void>((resolve) => {
    const url = 'http://unleash-test-6-502.app';
    nock(url).persist().get('/client/features').reply(502, 'blabla');
    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      refreshInterval: 10,
      bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
      storageProvider: new InMemStorageProvider(),
      mode: { type: 'polling', format: 'full' },
    });
    repo.on('warn', (warn) => {
      expect(warn).toBeTruthy();
      expect(warn).toEqual(`${url}/client/features responded 502. Backing off`);
      resolve();
    });
    repo.start();
  }));

test('should handle 503 request error and emit warn event', () =>
  new Promise<void>((resolve) => {
    const url = 'http://unleash-test-6-503.app';
    nock(url).persist().get('/client/features').reply(503, 'blabla');
    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      refreshInterval: 10,
      bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
      storageProvider: new InMemStorageProvider(),
      mode: { type: 'polling', format: 'full' },
    });
    repo.on('warn', (warn) => {
      expect(warn).toBeTruthy();
      expect(warn).toEqual(`${url}/client/features responded 503. Backing off`);
      resolve();
    });
    repo.start();
  }));

test('should handle 504 request error and emit warn event', () =>
  new Promise<void>((resolve) => {
    const url = 'http://unleash-test-6-504.app';
    nock(url).persist().get('/client/features').reply(504, 'blabla');
    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      refreshInterval: 10,
      bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
      storageProvider: new InMemStorageProvider(),
      mode: { type: 'polling', format: 'full' },
    });
    repo.on('warn', (warn) => {
      expect(warn).toBeTruthy();
      expect(warn).toEqual(`${url}/client/features responded 504. Backing off`);
      resolve();
    });
    repo.start();
  }));

test('should handle 304 as silent ok', () => {
  expect.assertions(0);

  return new Promise<void>((resolve, reject) => {
    const url = 'http://unleash-test-6.app';
    nock(url).persist().get('/client/features').reply(304, '');

    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      refreshInterval: 10,
      bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
      storageProvider: new InMemStorageProvider(),
      mode: { type: 'polling', format: 'full' },
    });
    repo.on('error', reject);
    repo.on('unchanged', resolve);
    repo.start();
  });
});

test('should handle invalid JSON response', () =>
  new Promise<void>((resolve, reject) => {
    const url = 'http://unleash-test-7.app';
    nock(url).persist().get('/client/features').reply(200, '{"Invalid payload');

    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
      storageProvider: new InMemStorageProvider(),
      mode: { type: 'polling', format: 'full' },
      refreshInterval: 10,
    });
    repo.on('error', (err) => {
      expect(err).toBeTruthy();
      expect(
        err.message.indexOf('Unexpected token') > -1 ||
          err.message.indexOf('Unexpected end of JSON input') > -1 ||
          err.message.indexOf('Unterminated string in JSON') > -1,
      ).toBe(true);
      resolve();
    });
    repo.on('unchanged', resolve);
    repo.on('changed', reject);
    repo.start();
  }));

// TODO: bring back this test
// should we add a `request-timeout` catch on `polling-fetcher`?
test.skip('should respect timeout', (t) =>
  new Promise<void>((resolve, reject) => {
    const url = 'http://unleash-test-8.app';
    nock(url).persist().get('/client/features').delay(2000).reply(200, 'OK');

    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      refreshInterval: 1000,
      bootstrapProvider: new DefaultBootstrapProvider({}, appName, instanceId),
      storageProvider: new InMemStorageProvider(),
      mode: { type: 'polling', format: 'full' },
      timeout: 50,
    });

    repo.once('error', (err) => {
      expect(err).toBeTruthy();
      expect(err.message.indexOf('ECONNRESET') > -1).toBe(true);
      resolve();
    });
    repo.on('data', reject);
  }));

test('should warn on invalid features', () =>
  new Promise<void>((resolve) => {
    const url = 'http://unleash-test-1.app';
    setup(url, [
      {
        name: 'feature',
        enabled: null,
        strategies: false,
      },
    ]);
    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
      storageProvider: new InMemStorageProvider(),
      mode: { type: 'polling', format: 'full' },
      refreshInterval: 10,
    });

    repo.once('warn', (err) => {
      expect(err).toBeTruthy();
      repo.stop();
      resolve();
    });

    repo.start();
  }));

test('should warn on invalid variant', () =>
  new Promise<void>((resolve) => {
    const url = 'http://unleash-test-1-invalid-bariant.app';
    setup(url, [
      {
        name: 'feature',
        enabled: true,
        strategies: [
          {
            name: 'default',
          },
        ],
        variants: 'not legal',
      },
    ]);
    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
      storageProvider: new InMemStorageProvider(),
      mode: { type: 'polling', format: 'full' },
      refreshInterval: 10,
    });

    repo.once('warn', (err) => {
      expect(err).toContain('Unleash SDK was unable to update from fetcher');
      repo.stop();
      resolve();
    });

    repo.start();
  }));

test('should load bootstrap first if faster than unleash-api', () =>
  new Promise<void>((resolve) => {
    const url = 'http://unleash-test-2-api-url.app';
    const bootstrap = 'http://unleash-test-2-boostrap-url.app';
    nock(url)
      .persist()
      .get('/client/features')
      .delay(100)
      .reply(200, {
        version: 2,
        query: undefined,
        features: [
          {
            name: 'feature',
            enabled: true,
            strategies: [
              {
                name: 'default',
              },
              {
                name: 'unleash-api',
              },
            ],
          },
        ],
      });
    nock(bootstrap)
      .persist()
      .get('/')
      .reply(200, {
        version: 2,
        query: undefined,
        features: [
          {
            name: 'feature',
            enabled: false,
            strategies: [
              {
                name: 'default',
              },
              {
                name: 'bootstrap',
              },
            ],
          },
        ],
      });
    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      bootstrapProvider: new DefaultBootstrapProvider(
        { url: bootstrap },
        'test-app',
        'test-instance',
      ),
      storageProvider: new InMemStorageProvider(),
      mode: { type: 'polling', format: 'full' },
      refreshInterval: 10,
    });

    let bootstrapReady = false;
    repo.once('ready', () => {
      bootstrapReady = true;
      expect(
        engineFor(repo)
          .getState()
          .features.find((f) => f.name === 'feature')?.enabled,
      ).toBe(false);
    });
    repo.once('changed', () => {
      expect(bootstrapReady).toBe(true);
      expect(
        engineFor(repo)
          .getState()
          .features.find((f) => f.name === 'feature')?.enabled,
      ).toBe(true);
      resolve();
    });
    repo.start();
  }));

test('bootstrap should not override actual data', () =>
  new Promise<void>((resolve) => {
    const url = 'http://unleash-test-2-api-url.app';
    const bootstrap = 'http://unleash-test-2-boostrap-url.app';
    nock(url)
      .persist()
      .get('/client/features')
      .reply(200, {
        version: 2,
        query: undefined,
        features: [
          {
            name: 'feature',
            enabled: true,
            strategies: [
              {
                name: 'default',
              },
              {
                name: 'unleash-api',
              },
            ],
          },
        ],
      });
    nock(bootstrap)
      .persist()
      .get('/')
      .delay(100)
      .reply(200, {
        version: 2,
        query: undefined,
        features: [
          {
            name: 'feature',
            enabled: false,
            strategies: [
              {
                name: 'default',
              },
              {
                name: 'bootstrap',
              },
            ],
          },
        ],
      });
    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      bootstrapProvider: new DefaultBootstrapProvider(
        { url: bootstrap },
        'test-app',
        'test-instance',
      ),
      storageProvider: new InMemStorageProvider(),
      mode: { type: 'polling', format: 'full' },
      refreshInterval: 10,
    });

    // Await the slower bootstrap too, then check it did not overwrite live state.
    repo.start().then(() => {
      expect(
        engineFor(repo)
          .getState()
          .features.find((f) => f.name === 'feature')?.enabled,
      ).toBe(true);
      resolve();
    });
  }));

test('should load bootstrap first from file', () =>
  new Promise<void>((resolve) => {
    const url = 'http://unleash-test-3-api-url.app';
    nock(url).persist().get('/client/features').delay(100).reply(408);

    const path = join(tmpdir(), `test-bootstrap-${Math.round(Math.random() * 100000)}`);
    writeFileSync(
      path,
      JSON.stringify({
        version: 2,
        query: undefined,
        features: [
          {
            name: 'feature-bootstrap',
            enabled: true,
            strategies: [
              {
                name: 'default',
              },
              {
                name: 'bootstrap',
              },
            ],
          },
        ],
      }),
    );

    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      refreshInterval: 0,
      bootstrapProvider: new DefaultBootstrapProvider(
        { filePath: path },
        'test-app',
        'test-instance',
      ),
      storageProvider: new InMemStorageProvider(),
      mode: { type: 'polling', format: 'full' },
    });

    repo.on('ready', () => {
      expect(
        engineFor(repo)
          .getState()
          .features.find((feature) => feature.name === 'feature-bootstrap')?.enabled,
      ).toEqual(true);
      resolve();
    });
    repo.start();
  }));

test('should not crash on bogus bootstrap', () =>
  new Promise<void>((resolve) => {
    const url = 'http://unleash-test-4-api-url.app';
    nock(url).persist().get('/client/features').delay(100).reply(408);

    const path = join(tmpdir(), `test-bootstrap-${Math.round(Math.random() * 100000)}`);
    writeFileSync(path, 'just a random blob');

    const repo = newRepository({
      url,
      appName,
      instanceId,
      connectionId,
      refreshInterval: 0,
      bootstrapProvider: new DefaultBootstrapProvider(
        { filePath: path },
        'test-app',
        'test-instance',
      ),
      storageProvider: new InMemStorageProvider(),
      mode: { type: 'polling', format: 'full' },
    });

    repo.on('warn', (msg) => {
      expect(msg.startsWith('Unleash SDK was unable to load bootstrap')).toBe(true);
      resolve();
    });
    repo.start();
  }));

test('should load backup-file', () =>
  new Promise<void>((resolve) => {
    const appNameLocal = 'some-backup';
    const url = 'http://unleash-test-backup-api-url.app';
    nock(url).persist().get('/client/features').delay(100).reply(408);

    const backupPath = join(tmpdir());
    const backupFile = join(backupPath, `/unleash-backup-${appNameLocal}.json`);
    writeFileSync(
      backupFile,
      JSON.stringify({
        version: 2,
        query: undefined,
        features: [
          {
            name: 'feature-backup',
            enabled: true,
            strategies: [
              {
                name: 'default',
              },
              {
                name: 'backup',
              },
            ],
          },
        ],
      }),
    );

    const repo = newRepository({
      url,
      appName: appNameLocal,
      instanceId,
      connectionId,
      refreshInterval: 0,
      bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
      storageProvider: new FileStorageProvider(backupPath),
      mode: { type: 'polling', format: 'full' },
    });

    repo.on('ready', () => {
      expect(
        engineFor(repo)
          .getState()
          .features.find((feature) => feature.name === 'feature-backup')?.enabled,
      ).toEqual(true);
      resolve();
    });
    repo.start();
  }));

test('bootstrap should override load backup-file', () =>
  new Promise<void>((resolve) => {
    const appNameLocal = 'should_override';
    const url = 'http://unleash-test-backup-api-url.app';
    nock(url).persist().get('/client/features').delay(100).reply(408);

    const backupPath = join(tmpdir());
    const backupFile = join(backupPath, `/unleash-backup-${appNameLocal}.json`);
    writeFileSync(
      backupFile,
      JSON.stringify({
        version: 2,
        query: undefined,
        features: [
          {
            name: 'feature-backup',
            enabled: true,
            strategies: [
              {
                name: 'default',
              },
              {
                name: 'backup',
              },
            ],
          },
        ],
      }),
    );

    const repo = newRepository({
      url,
      appName: appNameLocal,
      instanceId,
      connectionId,
      refreshInterval: 0,
      bootstrapProvider: new DefaultBootstrapProvider(
        {
          features: {
            version: 2,
            query: undefined,
            features: [
              {
                name: 'feature-backup',
                enabled: false,
                strategies: [
                  { variants: [], name: 'default', parameters: {}, constraints: [] },
                  { variants: [], name: 'bootstrap', parameters: {}, constraints: [] },
                ],
              },
            ],
          },
        },
        'test-app',
        'test-instance',
      ),
      storageProvider: new FileStorageProvider(backupPath),
      mode: { type: 'polling', format: 'full' },
    });

    repo.on('ready', () => {
      expect(
        engineFor(repo)
          .getState()
          .features.find((feature) => feature.name === 'feature-backup')?.enabled,
      ).toEqual(false);
      resolve();
    });
    repo.on('error', () => {});
    repo.start();
  }));

test('Failing two times and then succeed should decrease interval to 2 times initial interval (404)', async () => {
  const url = 'http://unleash-test-fail5times.app';
  nock(url).persist().get('/client/features').reply(404);
  const repo = newRepository({
    url,
    appName,
    instanceId,
    connectionId,
    refreshInterval: 10,
    bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
    storageProvider: new InMemStorageProvider(),
    mode: { type: 'polling', format: 'full' },
  });
  await fetcherFor(repo).fetch();
  expect(1).toEqual(fetcherFor(repo).getFailures());
  expect(20).toEqual(fetcherFor(repo).nextFetch());
  await fetcherFor(repo).fetch();
  expect(2).toEqual(fetcherFor(repo).getFailures());
  expect(30).toEqual(fetcherFor(repo).nextFetch());
  nock.cleanAll();
  nock(url)
    .persist()
    .get('/client/features')
    .reply(200, {
      version: 2,
      features: [
        {
          name: 'feature-backup',
          enabled: true,
          strategies: [
            {
              name: 'default',
            },
            {
              name: 'backup',
            },
          ],
        },
      ],
    });

  await fetcherFor(repo).fetch();

  expect(1).toEqual(fetcherFor(repo).getFailures());
  expect(20).toEqual(fetcherFor(repo).nextFetch());
});

// make-fetch-happens actually automatically retries two extra times on 429
// with a timeout of 1000, this makes us have to wait up to 3 seconds for a single test to succeed
// TODO: unskip it when new transport layer is added on the migration of make-fetch-happen
// Once we have a new transport with `baseDelay` and `maxBackoffMs` re-enable this test.
test.skip('Failing two times should increase interval to 3 times initial interval (initial interval + 2 * interval)', async () => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    loopLimit: 15001,
  });

  const url = 'http://unleash-test-fail5times.app';
  nock(url)
    .persist()
    .get('/client/features')
    .times(3) // Handle the 3 retry attempts
    .reply(429);

  const repo = newRepository({
    url,
    appName,
    instanceId,
    connectionId,
    refreshInterval: 10,
    bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
    storageProvider: new InMemStorageProvider(),
    mode: { type: 'polling', format: 'full' },
  });

  try {
    const p1 = fetcherFor(repo).fetch();
    // await vi.advanceTimersByTimeAsync(999999); // Skip everything
    await vi.waitFor<void>(() => {
      timeout: 5000;
    });

    await vi.runAllTimersAsync();
    await p1;
    expect(fetcherFor(repo).getFailures()).toEqual(1);
    expect(fetcherFor(repo).nextFetch()).toEqual(20);

    const p2 = fetcherFor(repo).fetch();
    // await vi.runAllTimersAsync();
    await vi.waitFor<void>(() => {
      timeout: 5000;
    });

    await p2;
    expect(fetcherFor(repo).getFailures()).toEqual(2);
    expect(fetcherFor(repo).nextFetch()).toEqual(30);
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
    nock.cleanAll();
  }

  // fetch 1
  const p1 = fetcherFor(repo).fetch();
  await vi.runAllTimersAsync();

  await p1;

  // retries 2 extra times with 1000ms + 2000ms delays = ~3 seconds per fetcherFor(repo).fetch()
  // 2 calls ~6sec, 15000ms timeout
  // await vi.advanceTimersByTimeAsync(15001); // fast-forwards fake time past timeout

  expect(1).toEqual(fetcherFor(repo).getFailures());
  expect(20).toEqual(fetcherFor(repo).nextFetch());

  // fetch 1
  const p2 = fetcherFor(repo).fetch();
  // await vi.advanceTimersByTimeAsync(15001);
  await vi.runAllTimersAsync();

  await p2;

  expect(2).toEqual(fetcherFor(repo).getFailures());
  expect(30).toEqual(fetcherFor(repo).nextFetch());
});

// Skipped because make-fetch-happens actually automatically retries two extra times on 429
// with a timeout of 1000, this makes us have to wait up to 3 seconds for a single test to succeed
// TODO: unskip it when new transport layer is added on the migration of make-fetch-happen
// Once we have a new transport with `baseDelay` and `maxBackoffMs` re-enable this test.
test.skip('Failing two times and then succeed should decrease interval to 2 times initial interval (429)', async () => {
  const url = 'http://unleash-test-fail5times.app';
  nock(url).persist().get('/client/features').reply(429);
  const repo = newRepository({
    url,
    appName,
    instanceId,
    connectionId,
    refreshInterval: 10,
    bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
    storageProvider: new InMemStorageProvider(),
    mode: { type: 'polling', format: 'full' },
  });
  await fetcherFor(repo).fetch();
  expect(1).toEqual(fetcherFor(repo).getFailures());
  expect(20).toEqual(fetcherFor(repo).nextFetch());
  await fetcherFor(repo).fetch();
  expect(2).toEqual(fetcherFor(repo).getFailures());
  expect(30).toEqual(fetcherFor(repo).nextFetch());
  nock.cleanAll();
  nock(url)
    .persist()
    .get('/client/features')
    .reply(200, {
      version: 2,
      features: [
        {
          name: 'feature-backup',
          enabled: true,
          strategies: [
            {
              name: 'default',
            },
            {
              name: 'backup',
            },
          ],
        },
      ],
    });

  await fetcherFor(repo).fetch();
  expect(1).toEqual(fetcherFor(repo).getFailures());
  expect(20).toEqual(fetcherFor(repo).nextFetch());
});

test('Stopping repository should stop unchanged event reporting', async () => {
  const url = 'http://unleash-test-stop-304.app';
  nock(url).persist().get('/client/features').reply(304, '');
  const repo = newRepository({
    url,
    appName,
    instanceId,
    connectionId,
    refreshInterval: 10,
    bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
    storageProvider: new InMemStorageProvider(),
    mode: { type: 'polling', format: 'full' },
  });
  repo.on('unchanged', () => {
    assert.fail('Should not emit unchanged event after stopping');
  });

  const promise = fetcherFor(repo).fetch();
  repo.stop(); // remove all listeners
  await promise;
});

test('Stopping repository should stop storage provider updates', async () => {
  const url = 'http://unleash-test-stop-200.app';
  const feature = {
    name: 'feature',
    enabled: true,
    strategies: [{ variants: [], name: 'default', parameters: {}, constraints: [] }],
  };
  setup(url, [feature]);
  const storageProvider: StorageProvider<ClientFeaturesResponse> = new InMemStorageProvider();
  const repo = newRepository({
    url,
    appName,
    instanceId,
    connectionId,
    refreshInterval: 10,
    bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
    storageProvider,
    mode: { type: 'polling', format: 'full' },
  });

  const promise = fetcherFor(repo).fetch();
  repo.stop(); // stop storage provider from accepting commands
  await promise;

  const result = await storageProvider.get(appName);
  expect(result).toEqual(undefined);
});

test('Streaming deltas', async () => {
  expect.assertions(5);
  const url = 'http://unleash-test-streaming.app';
  const feature = {
    name: 'feature',
    enabled: true,
    strategies: [{ variants: [], name: 'default', parameters: {}, constraints: [] }],
  };
  setup(url, [{ ...feature, name: 'initialFetch' }]);
  const storageProvider: StorageProvider<ClientFeaturesResponse> = new InMemStorageProvider();
  const eventSource = createMockEventSource();

  const repo = newRepository({
    url,
    appName,
    instanceId,
    connectionId,
    refreshInterval: 10,
    bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
    storageProvider,
    eventSource,
    mode: { type: 'streaming' },
  });

  await repo.start();

  // Hydration supplies the initial streaming state.
  eventSource.emit('unleash-connected', {
    type: 'unleash-connected',
    data: JSON.stringify({
      events: [
        {
          type: 'hydration',
          eventId: 1,
          features: [{ ...feature, name: 'deltaFeature' }],
          segments: [],
        },
      ],
    }),
  });

  const before = engineFor(repo).getState().features;
  expect(before).toStrictEqual([{ ...feature, name: 'deltaFeature' }]);

  // update with feature
  eventSource.emit('unleash-updated', {
    type: 'unleash-updated',
    data: JSON.stringify({
      events: [
        {
          type: 'feature-updated',
          eventId: 2,
          feature: { ...feature, enabled: false, name: 'deltaFeature' },
        },
      ],
    }),
  });
  const firstUpdate = engineFor(repo).getState().features;
  expect(firstUpdate).toStrictEqual([{ ...feature, enabled: false, name: 'deltaFeature' }]);

  eventSource.emit('unleash-updated', {
    type: 'unleash-updated',
    data: JSON.stringify({
      events: [
        {
          type: 'feature-removed',
          eventId: 3,
          featureName: 'deltaFeature',
          project: 'irrelevant',
        },
      ],
    }),
  });
  const secondUpdate = engineFor(repo).getState().features;
  expect(secondUpdate).toStrictEqual([]);

  eventSource.emit('unleash-updated', {
    type: 'unleash-updated',
    data: JSON.stringify({
      events: [
        {
          type: 'segment-updated',
          eventId: 4,
          segment: { id: 1, constraints: [] },
        },
      ],
    }),
  });
  const segment = engineFor(repo)
    .getState()
    .segments?.find((segment) => segment.id === 1);
  expect(segment).toStrictEqual({ id: 1, constraints: [] });

  eventSource.emit('unleash-updated', {
    type: 'unleash-updated',
    data: JSON.stringify({
      events: [
        {
          type: 'segment-removed',
          eventId: 5,
          segmentId: 1,
        },
      ],
    }),
  });
  const removedSegment = engineFor(repo)
    .getState()
    .segments?.find((segment) => segment.id === 1);
  expect(removedSegment).toStrictEqual(undefined);

  const recordedWarnings: string[] = [];
  repo.on('warn', (msg) => {
    recordedWarnings.push(msg);
  });
});

function setupPollingDeltaApi(url: string, events: DeltaEvent[]) {
  return nock(url).get('/client/delta').reply(200, { events });
}

test('Polling delta', async () => {
  const url = 'http://unleash-test-polling-delta.app';
  const feature = {
    name: 'deltaFeature',
    enabled: true,
    strategies: [],
  };
  setupPollingDeltaApi(url, [
    {
      type: 'hydration',
      eventId: 1,
      features: [feature],
      segments: [],
    },
  ]);
  const storageProvider: StorageProvider<ClientFeaturesResponse> = new InMemStorageProvider();

  const repo = newRepository({
    url,
    appName,
    instanceId,
    connectionId,
    refreshInterval: 10,
    bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
    storageProvider,
    mode: { type: 'polling', format: 'delta' },
  });
  await fetcherFor(repo).fetch();

  const before = engineFor(repo).getState().features;
  expect(before).toStrictEqual([feature]);

  setupPollingDeltaApi(url, [
    {
      type: 'feature-updated',
      eventId: 2,
      feature: { ...feature, enabled: false },
    },
  ]);
  await fetcherFor(repo).fetch();

  const updatedFeature = engineFor(repo).getState().features;
  expect(updatedFeature).toStrictEqual([{ ...feature, enabled: false }]);

  setupPollingDeltaApi(url, [
    {
      type: 'feature-removed',
      eventId: 3,
      featureName: feature.name,
      project: 'irrelevant',
    },
  ]);
  await fetcherFor(repo).fetch();

  const noFeatures = engineFor(repo).getState().features;
  expect(noFeatures).toStrictEqual([]);

  setupPollingDeltaApi(url, [
    {
      type: 'segment-updated',
      eventId: 4,
      segment: { id: 1, constraints: [] },
    },
  ]);
  await fetcherFor(repo).fetch();

  const segment = engineFor(repo)
    .getState()
    .segments?.find((segment) => segment.id === 1);
  expect(segment).toStrictEqual({ id: 1, constraints: [] });

  setupPollingDeltaApi(url, [
    {
      type: 'segment-removed',
      eventId: 5,
      segmentId: 1,
    },
  ]);
  await fetcherFor(repo).fetch();

  const noSegment = engineFor(repo)
    .getState()
    .segments?.find((segment) => segment.id === 1);
  expect(noSegment).toStrictEqual(undefined);
});

test('Switch from polling to streaming mode via HTTP header', async () => {
  const url = 'http://unleash-test-mode-switch-polling-to-streaming.app';
  const feature = {
    name: 'feature',
    enabled: true,
    strategies: [
      {
        name: 'default',
      },
    ],
  };

  nock(url)
    .persist()
    .get('/client/features')
    .reply(
      200,
      { version: 2, query: undefined, features: [feature] },
      { 'fetch-mode': 'streaming' },
    );

  nock(url).persist().get('/client/streaming').reply(200);

  const storageProvider: StorageProvider<ClientFeaturesResponse> = new InMemStorageProvider();

  const repo = newRepository({
    url,
    appName,
    instanceId,
    connectionId,
    refreshInterval: 10,
    bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
    storageProvider,
    mode: { type: 'polling', format: 'full' },
  });

  const modePromise = new Promise<void>((resolve) => {
    repo.once('mode', (data) => {
      expect(data).toStrictEqual({ from: 'polling', to: 'streaming' });
      resolve();
    });
  });

  await repo.start();

  await fetcherFor(repo).fetch();

  await modePromise;

  expect(fetcherFor(repo).getMode()).toEqual('streaming');

  repo.stop();
});

test('Switch from streaming to polling mode via EventSource', async () => {
  const url = 'http://unleash-test-mode-switch-streaming-to-polling.app';
  const feature = {
    name: 'feature',
    enabled: true,
    strategies: [
      {
        name: 'default',
      },
    ],
  };

  nock(url)
    .persist()
    .get('/client/features')
    .reply(200, { version: 2, query: undefined, features: [{ ...feature, enabled: false }] });

  const storageProvider: StorageProvider<ClientFeaturesResponse> = new InMemStorageProvider();
  const eventSource = createMockEventSource();

  const repo = newRepository({
    url,
    appName,
    instanceId,
    connectionId,
    refreshInterval: 10,
    bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
    storageProvider,
    eventSource,
    mode: { type: 'streaming' },
  });

  await repo.start();

  eventSource.emit('unleash-connected', {
    type: 'unleash-connected',
    data: JSON.stringify({
      events: [
        {
          type: 'hydration',
          eventId: 1,
          features: [feature],
          segments: [],
        },
      ],
    }),
  });

  let toggles = engineFor(repo).getState().features;
  expect(toggles[0].enabled).toEqual(true);

  const modePromise = new Promise<void>((resolve) => {
    repo.once('mode', (data) => {
      expect(data).toStrictEqual({ from: 'streaming', to: 'polling' });
      resolve();
    });
  });

  eventSource.emit('fetch-mode', {
    data: 'polling',
  });

  await modePromise;

  expect(fetcherFor(repo).getMode()).toEqual('polling');
  expect(eventSource.closed).toBe(true);

  await fetcherFor(repo).fetch();

  toggles = engineFor(repo).getState().features;
  expect(toggles[0].enabled).toEqual(false);

  repo.stop();
});

test('setMode can switch from polling to streaming mode', async () => {
  const url = 'http://unleash-test-setmode-polling-to-streaming.app';
  const feature = {
    name: 'feature',
    enabled: true,
    strategies: [{ variants: [], name: 'default', parameters: {}, constraints: [] }],
  };

  setup(url, [feature]);

  const storageProvider: StorageProvider<ClientFeaturesResponse> = new InMemStorageProvider();
  const mockEventSource = createMockEventSource();

  const repo = newRepository({
    url,
    appName,
    instanceId,
    connectionId,
    refreshInterval: 10,
    bootstrapProvider: new DefaultBootstrapProvider({}, appName, instanceId),
    storageProvider,
    eventSource: mockEventSource,
    mode: { type: 'polling', format: 'full' },
  });

  const modePromise = new Promise<void>((resolve) => {
    repo.once('mode', (data) => {
      expect(data).toStrictEqual({ from: 'polling', to: 'streaming' });
      resolve();
    });
  });

  await repo.start();

  expect(fetcherFor(repo).getMode()).toEqual('polling');

  await fetcherFor(repo).setMode('streaming');

  await modePromise;

  expect(fetcherFor(repo).getMode()).toEqual('streaming');

  repo.stop();
});

test('setMode can switch from streaming to polling mode', async () => {
  const url = 'http://unleash-test-setmode-streaming-to-polling.app';
  const feature = {
    name: 'feature',
    enabled: false,
    strategies: [{ variants: [], name: 'default', parameters: {}, constraints: [] }],
  };

  setup(url, [{ ...feature, enabled: true }]);

  const storageProvider: StorageProvider<ClientFeaturesResponse> = new InMemStorageProvider();
  const eventSource = createMockEventSource();

  const repo = newRepository({
    url,
    appName,
    instanceId,
    connectionId,
    refreshInterval: 10,
    bootstrapProvider: new DefaultBootstrapProvider({}, appName, instanceId),
    storageProvider,
    eventSource,
    mode: { type: 'streaming' },
  });

  await repo.start();

  eventSource.emit('unleash-connected', {
    type: 'unleash-connected',
    data: JSON.stringify({
      events: [
        {
          type: 'hydration',
          eventId: 1,
          features: [feature],
          segments: [],
        },
      ],
    }),
  });

  let toggles = engineFor(repo).getState().features;
  expect(toggles[0].enabled).toEqual(false);

  const modePromise = new Promise<void>((resolve) => {
    repo.once('mode', (data) => {
      expect(data).toStrictEqual({ from: 'streaming', to: 'polling' });
      resolve();
    });
  });

  expect(fetcherFor(repo).getMode()).toEqual('streaming');

  await fetcherFor(repo).setMode('polling');

  await modePromise;

  expect(fetcherFor(repo).getMode()).toEqual('polling');
  expect(eventSource.closed).toBe(true);

  toggles = engineFor(repo).getState().features;
  expect(toggles[0].enabled).toEqual(true);

  repo.stop();
});

test('setMode should be no-op when repository is stopped', async () => {
  const url = 'http://unleash-test-setmode-stopped.app';
  const feature = {
    name: 'feature',
    enabled: true,
    strategies: [{ variants: [], name: 'default', parameters: {}, constraints: [] }],
  };

  setup(url, [feature]);

  const repo = newRepository({
    url,
    appName,
    instanceId,
    connectionId,
    refreshInterval: 10,
    storageProvider: new InMemStorageProvider(),
    bootstrapProvider: new DefaultBootstrapProvider({}, appName, instanceId),
    mode: { type: 'polling', format: 'full' },
  });

  await repo.start();
  expect(fetcherFor(repo).getMode()).toEqual('polling');

  repo.stop();

  await fetcherFor(repo).setMode('streaming');
  expect(fetcherFor(repo).getMode()).toEqual('polling');
});

test('SSE with HTTP mocking - should process unleash-connected event', async () => {
  const url = 'http://unleash-test-sse-http.app';
  const feature = {
    name: 'test-feature',
    enabled: true,
    strategies: [
      {
        name: 'default',
      },
    ],
  };

  const sseResponse = createSSEResponse([
    {
      event: 'unleash-connected',
      data: {
        events: [
          {
            type: 'hydration',
            eventId: 1,
            features: [feature],
            segments: [],
          },
        ],
      },
    },
  ]);

  nock(url)
    .persist()
    .get('/client/streaming')
    .reply(200, sseResponse, { 'Content-Type': 'text/event-stream' });

  const storageProvider: StorageProvider<ClientFeaturesResponse> = new InMemStorageProvider();

  const repo = newRepository({
    url,
    appName,
    instanceId,
    connectionId,
    refreshInterval: 10,
    bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
    storageProvider,
    mode: { type: 'streaming' },
  });

  const changedEvent = new Promise<void>((resolve) => {
    repo.once('changed', resolve);
  });

  await repo.start();
  await changedEvent;

  const toggles = engineFor(repo).getState().features;
  expect(toggles.length).toEqual(1);
  expect(toggles[0].name).toEqual('test-feature');
  expect(toggles[0].enabled).toEqual(true);

  repo.stop();
});

test('SSE with HTTP mocking - should process unleash-updated event', async () => {
  const url = 'http://unleash-test-sse-http-updated.app';
  const feature = {
    name: 'test-feature',
    enabled: false,
    strategies: [
      {
        name: 'default',
      },
    ],
  };

  const sseResponse = createSSEResponse([
    {
      event: 'unleash-connected',
      data: {
        events: [
          {
            type: 'hydration',
            eventId: 1,
            features: [feature],
            segments: [],
          },
        ],
      },
    },
    {
      event: 'unleash-updated',
      data: {
        events: [
          {
            type: 'feature-updated',
            eventId: 2,
            feature: { ...feature, enabled: true },
          },
        ],
      },
    },
  ]);

  nock(url)
    .persist()
    .get('/client/streaming')
    .reply(200, sseResponse, { 'Content-Type': 'text/event-stream' });

  const storageProvider: StorageProvider<ClientFeaturesResponse> = new InMemStorageProvider();

  const repo = newRepository({
    url,
    appName,
    instanceId,
    connectionId,
    refreshInterval: 10,
    bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
    storageProvider,
    mode: { type: 'streaming' },
  });

  let changeCount = 0;
  const changedEvents = new Promise<void>((resolve) => {
    repo.on('changed', () => {
      changeCount++;
      if (changeCount === 2) {
        resolve();
      }
    });
  });

  await repo.start();
  await changedEvents;

  const toggles = engineFor(repo).getState().features;
  expect(toggles[0].enabled).toEqual(true);

  repo.stop();
});

test('SSE parse error forces full rehydration without Last-Event-ID', async () => {
  const url = 'http://unleash-test-sse-parse-error.app';

  const initialHydration = createSSEResponse([
    {
      event: 'unleash-connected',
      data: {
        events: [
          {
            type: 'hydration',
            eventId: 1,
            features: [
              {
                name: 'test-feature',
                enabled: false,
                strategies: [{ name: 'default' }],
              },
            ],
            segments: [],
          },
        ],
      },
    },
  ]);

  const brokenResponse = 'event: unleash-updated\n' + 'data: { this-is: not-valid-json }\n\n';

  const secondHydration = createSSEResponse([
    {
      event: 'unleash-connected',
      data: {
        events: [
          {
            type: 'hydration',
            eventId: 2,
            features: [
              {
                name: 'test-feature',
                // little cheat - we send a different enabled state so we can wait for it
                enabled: true,
                strategies: [{ name: 'default' }],
              },
            ],
            segments: [],
          },
        ],
      },
    },
  ]);

  const seenRequests: Record<string, string | undefined>[] = [];

  nock(url)
    .get('/client/streaming')
    .reply(function () {
      seenRequests.push(this.req.headers);
      return [200, initialHydration, { 'Content-Type': 'text/event-stream' }];
    })
    .get('/client/streaming')
    .reply(function () {
      seenRequests.push(this.req.headers);
      return [200, brokenResponse, { 'Content-Type': 'text/event-stream' }];
    })
    .get('/client/streaming')
    .reply(function () {
      seenRequests.push(this.req.headers);
      return [200, secondHydration, { 'Content-Type': 'text/event-stream' }];
    });

  const storageProvider: StorageProvider<ClientFeaturesResponse> = new InMemStorageProvider();

  const repo = newRepository({
    url,
    appName,
    instanceId,
    connectionId,
    refreshInterval: 10,
    bootstrapProvider: new DefaultBootstrapProvider({}, 'test-app', 'test-instance'),
    storageProvider,
    mode: { type: 'streaming' },
  });

  // now we can wait until the second hydration has taken place
  const waitedForRehydration = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for rehydration'));
    }, 5_000);

    repo.on('changed', () => {
      const toggles = engineFor(repo).getState().features;
      const featureToggle = toggles.find((f) => f.name === 'test-feature');
      if (featureToggle?.enabled === true) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  await repo.start();
  await waitedForRehydration;
  repo.stop();

  expect(seenRequests.length).toBe(3);

  const firstReqHeaders = seenRequests[0];
  const secondReqHeaders = seenRequests[1];
  const thirdReqHeaders = seenRequests[2];

  expect(firstReqHeaders['last-event-id']).toBeUndefined();
  // we do expect a last event id second time round, since the hydration event will have carried one
  expect(secondReqHeaders['last-event-id']).toBe('0');
  // no last event id is explicitly requesting a full hydration
  expect(thirdReqHeaders['last-event-id']).toBeUndefined();
});
