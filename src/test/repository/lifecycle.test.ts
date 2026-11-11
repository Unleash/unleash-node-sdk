import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { type ClientFeatures, UnleashEngine } from '@unleash/yggdrasil-engine';
import { afterEach, expect, test, vi } from 'vitest';
import Repository, { type RepositoryOptions } from '../../repository';
import InMemStorageProvider from '../../repository/storage-provider-in-mem';
import { FakeFetcher, feature, state } from '../fixtures';

const active: Array<{ repository: Repository; engine: UnleashEngine }> = [];
const directories: string[] = [];
function setup(options: Partial<RepositoryOptions> = {}) {
  const engine = new UnleashEngine();
  const fetcher = new FakeFetcher();
  const storage = new InMemStorageProvider<ClientFeatures>();
  const repository = new Repository({
    url: 'http://repository.test/api/',
    appName: 'test',
    instanceId: 'instance',
    connectionId: 'connection',
    refreshInterval: 1000,
    mode: { type: 'polling', format: 'full' },
    engine,
    fetcher,
    bootstrapProvider: { readBootstrap: async () => undefined },
    storageProvider: storage,
    ...options,
  });
  active.push({ repository, engine });
  return { repository, engine, fetcher, storage };
}

afterEach(async () => {
  for (const { repository, engine } of active.splice(0)) {
    repository.stop();
    engine.destroy();
  }
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test('applies feature and segment deltas and persists a complete reusable snapshot', async () => {
  const { repository, engine, fetcher, storage } = setup();
  await repository.start();
  await fetcher.publish({
    events: [{ type: 'hydration', eventId: 1, features: [], segments: [] }],
  });
  const constrained = feature('segmented', {
    strategies: [{ name: 'default', segments: [1], variants: undefined }],
  });
  await fetcher.publish({
    events: [
      {
        type: 'segment-updated',
        eventId: 2,
        segment: {
          id: 1,
          constraints: [{ contextName: 'userId', operator: 'IN', values: ['user'] }],
        },
      },
      { type: 'feature-updated', eventId: 3, feature: constrained },
    ],
  });
  expect(engine.isEnabled('segmented', { userId: 'user' }).enabled).toBe(true);
  expect(engine.isEnabled('segmented', { userId: 'other' }).enabled).toBe(false);
  await fetcher.publish({
    events: [
      { type: 'feature-removed', eventId: 4, featureName: 'segmented', project: 'default' },
      { type: 'segment-removed', eventId: 5, segmentId: 1 },
    ],
  });
  expect(engine.listFeatures().features).toEqual([]);
  const persisted = await storage.get('test');
  expect(persisted?.features).toEqual([]);
  expect(persisted?.segments).toEqual([]);
});

test('restores backup state with ready but no synchronization or changed event', async () => {
  const storage = new InMemStorageProvider<ClientFeatures>();
  await storage.set('test', state());
  const { repository, engine } = setup({ storageProvider: storage });
  const ready = once(repository, 'ready');
  const changed = vi.fn();
  const synchronized = vi.fn();
  repository.on('changed', changed).on('synchronized', synchronized);
  await repository.start();
  await ready;
  expect(engine.isEnabled('feature').enabled).toBe(true);
  expect(changed).not.toHaveBeenCalled();
  expect(synchronized).not.toHaveBeenCalled();
});

test('bootstrap outranks backup regardless of which local source finishes first', async () => {
  for (const bootstrapFirst of [true, false]) {
    let finish!: (value: ClientFeatures) => void;
    const delayed = new Promise<ClientFeatures>((resolve) => {
      finish = resolve;
    });
    const backup = state([feature('backup')]);
    const bootstrap = state([feature('bootstrap')]);
    const { repository, engine } = setup({
      storageProvider: { get: async () => (bootstrapFirst ? delayed : backup), set: vi.fn() },
      bootstrapProvider: { readBootstrap: async () => (bootstrapFirst ? bootstrap : delayed) },
    });
    const starting = repository.start();
    await new Promise<void>((resolve) => setImmediate(resolve));
    finish(bootstrapFirst ? backup : bootstrap);
    await starting;
    expect(engine.listFeatures().features.map((flag) => flag.name)).toEqual(['bootstrap']);
  }
});

test('live state outranks late bootstrap and backup', async () => {
  let finish!: (value: ClientFeatures) => void;
  const local = new Promise<ClientFeatures>((resolve) => {
    finish = resolve;
  });
  const fetcher = new FakeFetcher(state([feature('live')]));
  const { repository, engine } = setup({
    fetcher,
    storageProvider: { get: () => local, set: vi.fn() },
    bootstrapProvider: { readBootstrap: () => local },
  });
  const starting = repository.start();
  await new Promise<void>((resolve) => setImmediate(resolve));
  finish(state([feature('stale')]));
  await starting;
  expect(engine.listFeatures().features.map((flag) => flag.name)).toEqual(['live']);
});

test('bootstrap is not persisted and only announces first readiness', async () => {
  const save = vi.fn();
  const { repository, engine } = setup({
    bootstrapProvider: { readBootstrap: async () => state() },
    storageProvider: { get: async () => undefined, set: save },
  });
  const ready = once(repository, 'ready');
  const changed = vi.fn();
  const synchronized = vi.fn();
  repository.on('changed', changed).on('synchronized', synchronized);
  await repository.start();
  await ready;
  expect(engine.isEnabled('feature').enabled).toBe(true);
  expect(save).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  expect(synchronized).not.toHaveBeenCalled();
});

test('empty bootstrap and backup do not make a client ready', async () => {
  const { repository } = setup({
    bootstrapProvider: { readBootstrap: async () => state([]) },
    storageProvider: { get: async () => state([]), set: vi.fn() },
  });
  const ready = vi.fn();
  repository.on('ready', ready);
  await repository.start();
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(ready).not.toHaveBeenCalled();
});

test('cache failures do not prevent ready, changed, synchronization, or live evaluation', async () => {
  const { repository, fetcher, engine } = setup({
    storageProvider: {
      get: async () => undefined,
      set: async () => {
        throw new Error('read-only cache');
      },
    },
  });
  const synchronized = once(repository, 'synchronized');
  const ready = once(repository, 'ready');
  const changed = vi.fn();
  const warn = vi.fn();
  repository.on('changed', changed).on('warn', warn);
  await repository.start();
  await fetcher.publish(state());
  await synchronized;
  await ready;
  expect(engine.isEnabled('feature').enabled).toBe(true);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('read-only cache'));
});

test('stalled cache persistence does not delay synchronization or changed', async () => {
  let finish!: () => void;
  const saving = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const { repository, fetcher } = setup({
    storageProvider: { get: async () => undefined, set: () => saving },
  });
  const synchronized = once(repository, 'synchronized');
  const changed = once(repository, 'changed');
  const updating = fetcher.publish(state());
  await synchronized;
  await changed;
  finish();
  await updating;
});

test('invalid updates warn and preserve previously accepted state', async () => {
  const { repository, engine, fetcher } = setup();
  const warn = vi.fn();
  repository.on('warn', warn);
  await fetcher.publish(state());
  await fetcher.publish({
    version: 2,
    features: [{ name: 'invalid', enabled: 'not a boolean' }],
  } as unknown as ClientFeatures);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('unable to update'));
  expect(engine.isEnabled('feature').enabled).toBe(true);
});

test('forwards compilation warnings from network, bootstrap, and backup state', async () => {
  const invalidRule = state([
    feature('invalid-rule', {
      strategies: [
        {
          name: 'default',
          variants: undefined,
          constraints: [{ contextName: 'currentTime', operator: 'DATE_AFTER' }],
        },
      ],
    }),
  ]);
  for (const source of ['network', 'bootstrap', 'backup'] as const) {
    const { repository, fetcher } = setup({
      bootstrapProvider: {
        readBootstrap: async () => (source === 'bootstrap' ? invalidRule : undefined),
      },
      storageProvider: {
        get: async () => (source === 'backup' ? invalidRule : undefined),
        set: vi.fn(),
      },
    });
    const warn = vi.fn();
    repository.on('warn', warn);
    await repository.start();
    if (source === 'network') await fetcher.publish(invalidRule);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid-rule'));
  }
});

test('stopping ignores late fetcher callbacks and pending local reads', async () => {
  let finish!: (value: ClientFeatures) => void;
  const local = new Promise<ClientFeatures>((resolve) => {
    finish = resolve;
  });
  const save = vi.fn();
  const { repository, fetcher, engine } = setup({
    storageProvider: { get: () => local, set: save },
    bootstrapProvider: { readBootstrap: () => local },
  });
  const starting = repository.start();
  repository.stop();
  engine.destroy();
  finish(state());
  await starting;
  await expect(fetcher.publish(state())).resolves.toBeUndefined();
  expect(save).not.toHaveBeenCalled();
  expect(fetcher.stops).toBe(1);
});
