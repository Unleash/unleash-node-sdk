import { getSpecVersion } from '@unleash/yggdrasil-engine';
import nock from 'nock';
import { afterEach, expect, test, vi } from 'vitest';
import { AdaptiveFetcher } from '../../repository/adaptive-fetcher';
import type { FetchingOptions } from '../../repository/fetcher';
import { state, TestEventSource } from '../fixtures';

const active: AdaptiveFetcher[] = [];
function setup(options: Partial<FetchingOptions> = {}) {
  const eventSource = new TestEventSource();
  const fetcher = new AdaptiveFetcher({
    url: 'http://adaptive.test/api/',
    appName: 'test',
    instanceId: 'instance',
    connectionId: 'connection',
    refreshInterval: 1000,
    mode: { type: 'polling', format: 'full' },
    specVersion: getSpecVersion(),
    eventSource: eventSource as unknown as EventSource,
    ...options,
  });
  const update = vi.fn().mockResolvedValue(undefined);
  fetcher.registerUpdate(update);
  active.push(fetcher);
  return { fetcher, eventSource, update };
}
afterEach(() => {
  for (const fetcher of active.splice(0)) fetcher.stop();
  nock.cleanAll();
});

test('forwards polling payloads and automatically honors the streaming response header', async () => {
  const { fetcher, eventSource, update } = setup();
  const mode = vi.fn();
  fetcher.on('mode', mode);
  nock('http://adaptive.test')
    .get('/api/client/features')
    .reply(200, state(), { 'fetch-mode': 'streaming' });
  await fetcher.start();
  expect(fetcher.getMode()).toBe('streaming');
  expect(mode).toHaveBeenCalledWith({ from: 'polling', to: 'streaming' });
  const hydration = { events: [{ type: 'hydration', eventId: 1, features: [], segments: [] }] };
  await eventSource.send('unleash-connected', hydration);
  const delta = {
    events: [{ type: 'feature-removed', eventId: 2, featureName: 'removed', project: 'default' }],
  };
  await eventSource.send('unleash-updated', delta);
  expect(update.mock.calls).toEqual([[hydration], [delta]]);
  fetcher.stop();
  expect(eventSource.closed).toBe(true);
});

test('a server streaming hint switches to polling and delivers the polled state', async () => {
  const { fetcher, eventSource, update } = setup({ mode: { type: 'streaming' } });
  const mode = vi.fn();
  fetcher.on('mode', mode);
  await fetcher.start();
  nock('http://adaptive.test').get('/api/client/features').reply(200, state());
  await eventSource.send('fetch-mode', 'polling');
  expect(fetcher.getMode()).toBe('polling');
  expect(eventSource.closed).toBe(true);
  expect(update).toHaveBeenCalledWith(state());
  expect(mode).toHaveBeenCalledWith({ from: 'streaming', to: 'polling' });
});

test('hard streaming failures fall back to polling and forward a warning', async () => {
  const { fetcher, eventSource } = setup({ mode: { type: 'streaming' } });
  const warn = vi.fn();
  fetcher.on('warn', warn);
  await fetcher.start();
  nock('http://adaptive.test').get('/api/client/features').reply(200, state());
  await eventSource.send('error', { status: 403 });
  expect(fetcher.getMode()).toBe('polling');
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('403'));
});
