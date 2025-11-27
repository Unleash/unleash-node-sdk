import test from 'ava';
import { UnleashEvents } from '../../events';
import type { StreamingFetchingOptions } from '../../repository/fetcher';
import type { FailEvent } from '../../repository/streaming-fail-over';
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
    failureWindowMs: 60_000,
    maxFailuresUntilFailover: 5,
    ...overrides,
  };
}

type StreamingFetcherTestSubject = StreamingFetcher & {
  failoverStrategy: {
    shouldFailover: (event: FailEvent, now: Date) => boolean;
  };
  handleErrorEvent: (error: unknown) => Promise<void>;
};

test('emits Warn on SSE when failover is triggered', async (t) => {
  const warnings: unknown[] = [];
  const options = makeOptions({
    onModeChange: async () => {},
  });

  const fetcher = new StreamingFetcher(options);
  const testFetcher = fetcher as StreamingFetcherTestSubject;

  testFetcher.failoverStrategy.shouldFailover = () => true;

  fetcher.on(UnleashEvents.Warn, (payload) => {
    warnings.push(payload);
  });

  const error = { status: 429, message: 'Go away, there are way too many of you' };

  await testFetcher.handleErrorEvent(error);

  t.is(warnings.length, 1);
  t.is(warnings[0], 'Go away, there are way too many of you');
});

test('does not emit Warn on SSE when failover is not triggered', async (t) => {
  const warnings: unknown[] = [];
  const options = makeOptions({
    onModeChange: async () => {},
  });

  const fetcher = new StreamingFetcher(options);
  const testFetcher = fetcher as StreamingFetcherTestSubject;

  testFetcher.failoverStrategy.shouldFailover = () => false;

  fetcher.on(UnleashEvents.Warn, (payload) => {
    warnings.push(payload);
  });

  const error = { status: 500, message: 'Temporary server issue' };

  await testFetcher.handleErrorEvent(error);

  t.is(warnings.length, 0);
});

test('transient errors that cause failover report the last error', async (t) => {
  const warnings: unknown[] = [];
  const options = makeOptions({
    onModeChange: async () => {},
  });

  const fetcher = new StreamingFetcher(options);
  const testFetcher = fetcher as StreamingFetcherTestSubject;

  testFetcher.failoverStrategy.shouldFailover = (() => {
    const currentErrors: unknown[] = [];

    return (error: unknown) => {
      currentErrors.push(error);
      return currentErrors.length >= 3;
    };
  })();

  fetcher.on(UnleashEvents.Warn, (payload) => {
    warnings.push(payload);
  });

  await testFetcher.handleErrorEvent({ status: 500, message: 'Once in a lifetime issue' });
  await testFetcher.handleErrorEvent({ status: 500, message: 'Second once in a lifetime issue' });
  await testFetcher.handleErrorEvent({
    status: 500,
    message: 'Third once in a lifetime issue, thats too many',
  });

  t.is(warnings.length, 1);
  t.is(warnings[0], 'Third once in a lifetime issue, thats too many');
});
