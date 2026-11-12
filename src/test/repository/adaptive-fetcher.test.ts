import { EventEmitter } from 'node:events';
import nock from 'nock';
import { afterEach, expect, test, vi } from 'vitest';
import { AdaptiveFetcher } from '../../repository/adaptive-fetcher';

function createMockEventSource() {
  const emitter = new EventEmitter();
  const eventSource = {
    addEventListener(eventName: string, handler: (data: unknown) => void) {
      emitter.on(eventName, handler);
    },
    close() {
      emitter.removeAllListeners();
    },
    emit(eventName: string, data: unknown) {
      emitter.emit(eventName, data);
    },
  };
  return eventSource as unknown as EventSource & {
    emit: (eventName: string, data: unknown) => void;
  };
}

afterEach(() => {
  vi.useRealTimers();
  nock.cleanAll();
});

test('keeps a single polling loop after switching to streaming and back', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const url = 'http://unleash-test-adaptive-fetcher-single-poll-loop.app';
  nock(url).get('/client/features').reply(200, { features: [] }, { 'fetch-mode': 'streaming' });
  nock(url).persist().get('/client/features').reply(200, { features: [] });

  const eventSource = createMockEventSource();
  const fetcher = new AdaptiveFetcher({
    url,
    appName: 'test-app',
    instanceId: 'test-instance',
    connectionId: 'test-connection',
    refreshInterval: 1000,
    mode: { type: 'polling', format: 'full' },
    eventSource,
    onSave: async () => {},
  });

  await fetcher.start();
  expect(fetcher.getMode()).toEqual('streaming');

  const backToPolling = new Promise<void>((resolve) => {
    fetcher.once('mode', () => resolve());
  });
  eventSource.emit('error', { status: 429, message: 'Too many streaming clients' });
  await backToPolling;

  expect(fetcher.getMode()).toEqual('polling');
  expect(vi.getTimerCount()).toEqual(1);

  fetcher.stop();
});
