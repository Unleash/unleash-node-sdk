import nock from 'nock';
import { afterEach, expect, test, vi } from 'vitest';
import { SUPPORTED_SPEC_VERSION } from '../../repository';
import type { PollingFetchingOptions } from '../../repository/fetcher';
import { PollingFetcher } from '../../repository/polling-fetcher';
import { state } from '../fixtures';

const active: PollingFetcher[] = [];
function setup(options: Partial<PollingFetchingOptions> = {}) {
  const fetcher = new PollingFetcher({
    url: 'http://polling.test/api/',
    appName: 'test',
    instanceId: 'instance',
    connectionId: 'connection',
    refreshInterval: 1000,
    mode: { type: 'polling', format: 'full' },
    specVersion: SUPPORTED_SPEC_VERSION,
    ...options,
  });
  const update = vi.fn().mockResolvedValue(undefined);
  fetcher.registerUpdate(update);
  active.push(fetcher);
  return { fetcher, update };
}
afterEach(() => {
  for (const fetcher of active.splice(0)) fetcher.stop();
  nock.cleanAll();
});

test('fetches with filters, dynamic authorization, connection metadata, and supported spec version', async () => {
  const { fetcher, update } = setup({
    projectName: 'project',
    namePrefix: 'flag',
    tags: [{ name: 'team', value: 'sdk' }],
    headers: { Authorization: 'old' },
    customHeadersFunction: async () => ({ Authorization: 'fresh' }),
  });
  const request = nock('http://polling.test')
    .get('/api/client/features')
    .query({ project: 'project', namePrefix: 'flag', tag: 'team:sdk' })
    .matchHeader('authorization', 'fresh')
    .matchHeader('unleash-appname', 'test')
    .matchHeader('unleash-instanceid', 'instance')
    .matchHeader('unleash-connection-id', 'connection')
    .matchHeader('unleash-interval', '1000')
    .matchHeader('unleash-client-spec', SUPPORTED_SPEC_VERSION)
    .reply(200, state());
  await fetcher.start();
  expect(request.isDone()).toBe(true);
  expect(update).toHaveBeenCalledWith(state());
});

test('tracks etags and emits unchanged without delivering another state on 304', async () => {
  const { fetcher, update } = setup();
  const unchanged = vi.fn();
  fetcher.on('unchanged', unchanged);
  nock('http://polling.test')
    .get('/api/client/features')
    .reply(200, state(), { etag: 'revision-1' });
  await fetcher.start();
  const cached = nock('http://polling.test')
    .get('/api/client/features')
    .matchHeader('if-none-match', 'revision-1')
    .reply(304);
  await fetcher.fetch();
  expect(cached.isDone()).toBe(true);
  expect(fetcher.getEtag()).toBe('revision-1');
  expect(update).toHaveBeenCalledTimes(1);
  expect(unchanged).toHaveBeenCalledTimes(1);
});

test('clears an old etag if the next full response has none', async () => {
  const { fetcher } = setup({ etag: 'old' });
  nock('http://polling.test').get('/api/client/features').reply(200, state());
  await fetcher.start();
  expect(fetcher.getEtag()).toBeUndefined();
});

test('delivers delta payloads unchanged', async () => {
  const { fetcher, update } = setup({ mode: { type: 'polling', format: 'delta' } });
  const delta = { events: [{ type: 'hydration', eventId: 1, features: [], segments: [] }] };
  nock('http://polling.test').get('/api/client/delta').reply(200, delta);
  await fetcher.start();
  expect(update).toHaveBeenCalledWith(delta);
});

test.each([401, 403])(
  'HTTP %s stops scheduling refresh and reports an authorization error',
  async (status) => {
    const { fetcher } = setup();
    const error = vi.fn();
    fetcher.on('error', error);
    nock('http://polling.test').get('/api/client/features').reply(status);
    await fetcher.start();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Stopping refresh') }),
    );
    expect(fetcher.getFailures()).toBe(1);
  },
);

test.each([404, 429, 500, 502, 503, 504])(
  'HTTP %s backs off and a success reduces the interval',
  async (status) => {
    const { fetcher } = setup();
    const warn = vi.fn();
    fetcher.on('warn', warn);
    nock('http://polling.test')
      .get('/api/client/features')
      .times(status === 404 ? 1 : 3)
      .reply(status);
    await fetcher.start();
    expect(fetcher.getFailures()).toBe(1);
    expect(fetcher.nextFetch()).toBe(2000);
    expect(warn).toHaveBeenCalled();
    nock('http://polling.test').get('/api/client/features').reply(200, state());
    await fetcher.fetch();
    expect(fetcher.getFailures()).toBe(0);
    expect(fetcher.nextFetch()).toBe(1000);
  },
);

test('a server hint requests streaming instead of delivering the polling body', async () => {
  const onModeChange = vi.fn().mockResolvedValue(undefined);
  const { fetcher, update } = setup({ onModeChange });
  nock('http://polling.test')
    .get('/api/client/features')
    .reply(200, state(), { 'fetch-mode': 'streaming' });
  await fetcher.start();
  expect(onModeChange).toHaveBeenCalledWith('streaming');
  expect(update).not.toHaveBeenCalled();
});

test('reports malformed JSON and callback failures through error events', async () => {
  const { fetcher, update } = setup();
  const error = vi.fn();
  fetcher.on('error', error);
  nock('http://polling.test').get('/api/client/features').reply(200, '{invalid');
  await fetcher.start();
  expect(error).toHaveBeenCalledTimes(1);
  update.mockRejectedValueOnce(new Error('sink failed'));
  nock('http://polling.test').get('/api/client/features').reply(200, state());
  await fetcher.fetch();
  expect(error).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'sink failed' }));
});

test('disabled polling and stopped fetchers issue no requests', async () => {
  const disabled = setup({ refreshInterval: 0 }).fetcher;
  await disabled.start();
  const { fetcher, update } = setup();
  fetcher.stop();
  await fetcher.fetch();
  expect(update).not.toHaveBeenCalled();
});
