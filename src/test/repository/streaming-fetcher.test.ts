/** biome-ignore-all lint/suspicious/noExplicitAny: relaxed for testing */
import { expect, test } from 'vitest';
import { UnleashEvents } from '../../events';
import type { StreamingFetchingOptions } from '../../repository/fetcher';
import { StreamingFetcher } from '../../repository/streaming-fetcher';

function makeOptions(overrides: Partial<StreamingFetchingOptions> = {}): StreamingFetchingOptions {
  return {
    url: 'https://example.com',
    appName: 'test-app',
    instanceId: 'test-instance',
    headers: {},
    connectionId: 'conn-1',
    onSaveDelta: async () => {},
    onModeChange: async () => {},
    eventSource: undefined,
    ...overrides,
  } as any;
}

test('emits Warn on SSE when failover is triggered', async () => {
  const warnings: unknown[] = [];
  const options = makeOptions({
    onModeChange: async () => {},
  });

  const fetcher = new StreamingFetcher(options);
  const anyFetcher = fetcher as any;

  anyFetcher.failoverStrategy.shouldFailover = () => true;

  fetcher.on(UnleashEvents.Warn, (payload) => {
    warnings.push(payload);
  });

  const error = { status: 429, message: 'Go away, there are way too many of you' };

  await anyFetcher.handleErrorEvent(error);

  expect(warnings.length).toEqual(1);
  expect(warnings[0]).toEqual('Go away, there are way too many of you');
});

test('does not emit Warn on SSE when failover is not triggered', async () => {
  const warnings: unknown[] = [];
  const options = makeOptions({
    onModeChange: async () => {},
  });

  const fetcher = new StreamingFetcher(options);
  const anyFetcher = fetcher as any;

  anyFetcher.failoverStrategy.shouldFailover = () => false;

  fetcher.on(UnleashEvents.Warn, (payload) => {
    warnings.push(payload);
  });

  const error = { status: 500, message: 'Temporary server issue' };

  await anyFetcher.handleErrorEvent(error);

  expect(warnings.length).toEqual(0);
});

test('transient errors that cause failover report the last error', async () => {
  const warnings: unknown[] = [];
  const options = makeOptions({
    onModeChange: async () => {},
  });

  const fetcher = new StreamingFetcher(options);
  const anyFetcher = fetcher as any;

  anyFetcher.failoverStrategy.shouldFailover = (() => {
    const currentErrors: unknown[] = [];

    return (error: unknown) => {
      currentErrors.push(error);
      return currentErrors.length >= 3;
    };
  })();

  fetcher.on(UnleashEvents.Warn, (payload) => {
    warnings.push(payload);
  });

  await anyFetcher.handleErrorEvent({ status: 500, message: 'Once in a lifetime issue' });
  await anyFetcher.handleErrorEvent({ status: 500, message: 'Second once in a lifetime issue' });
  await anyFetcher.handleErrorEvent({
    status: 500,
    message: 'Third once in a lifetime issue, thats too many',
  });

  expect(warnings.length).toEqual(1);
  expect(warnings[0]).toEqual('Third once in a lifetime issue, thats too many');
});
