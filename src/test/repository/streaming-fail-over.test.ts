import test from 'ava';
import { FailoverStrategy, type FailEvent } from '../../repository/streaming-fail-over';

test('fails over immediately when server requests it', (t) => {
  const failOverStrategy = new FailoverStrategy(3, 10_000);

  const now = new Date('2024-01-01T00:00:00Z');

  const event: FailEvent = {
    type: 'server-hint',
    event: 'polling',
    message: 'Unleash has requested failover to polling',
    occurredAt: now,
  };

  t.true(failOverStrategy.shouldFailover(event, now));
});

test('does not fail over on arbitrary server events', (t) => {
  const failOverStrategy = new FailoverStrategy(3, 10_000);

  const now = new Date('2024-01-01T00:00:00Z');

  const event: FailEvent = {
    type: 'server-hint',
    event: 'a-new-and-exciting-unsupported-event',
    occurredAt: now,
    message: 'Service should frob the wranglebinder now',
  };

  t.false(failOverStrategy.shouldFailover(event, now));
});

test('fails over immediately on hard http status codes', (t) => {
  const failOverStrategy = new FailoverStrategy(3, 10_000);

  const now = new Date('2024-01-01T00:00:00Z');

  for (const statusCode of [401, 403, 404, 429]) {
    const event: FailEvent = {
      type: 'http-status-error',
      statusCode,
      occurredAt: now,
      message: `HTTP status error with status code ${statusCode}`,
    };

    t.true(
      failOverStrategy.shouldFailover(event, now),
      `Should failover on status code ${statusCode}`,
    );
  }
});

test('soft errors accumulate to failover within relax window', (t) => {
  const failOverStrategy = new FailoverStrategy(3, 60_000);
  const base = Date.UTC(1867, 10, 7, 0, 0, 0);

  const mkEvent = (offsetMs: number): FailEvent => ({
    type: 'http-status-error',
    statusCode: 503,
    occurredAt: new Date(base + offsetMs),
    message: `HTTP status error with status code 503`,
  });

  t.false(
    failOverStrategy.shouldFailover(mkEvent(0), new Date(base)),
    'Should not failover on first soft error',
  );

  t.false(
    failOverStrategy.shouldFailover(mkEvent(1000), new Date(base + 1000)),
    'Should not failover on second soft error',
  );

  // this is within the sliding window threshold so it's time to failover
  t.true(
    failOverStrategy.shouldFailover(mkEvent(2000), new Date(base + 2000)),
    'Should failover on third soft error within relax window',
  );
});

test('soft errors are pruned error window and do not cause failover', (t) => {
  const failOverStrategy = new FailoverStrategy(3, 1_000);
  const base = Date.UTC(1867, 10, 7, 0, 0, 0);

  const mkEvent = (offsetMs: number): FailEvent => ({
    type: 'http-status-error',
    statusCode: 502,
    occurredAt: new Date(base + offsetMs),
    message: `HTTP status error with status code 502`,
  });

  t.false(
    failOverStrategy.shouldFailover(mkEvent(0), new Date(base)),
    'First soft error should not trigger failover',
  );

  t.false(
    failOverStrategy.shouldFailover(mkEvent(2000), new Date(base + 2000)),
    'Second soft error after window should not trigger failover',
  );

  // event 3 lands outside the window that event 1 lands is so it's safe
  t.false(
    failOverStrategy.shouldFailover(mkEvent(3000), new Date(base + 3000)),
    'Third soft error should still not trigger failover since previous ones aged out',
  );
});

test('unhandled HTTP status codes never trigger failover', (t) => {
  const failOverStrategy = new FailoverStrategy(1, 10_000);
  const base = Date.UTC(1867, 10, 7, 0, 0, 0);

  const mkWeird = (code: number, offsetMs: number): FailEvent => ({
    type: 'http-status-error',
    statusCode: code,
    occurredAt: new Date(base + offsetMs),
    message: `HTTP status error with status code ${code}`,
  });

  // teapots are explicitly designed to stream so they never cause failover
  for (const statusCode of [418, 418, 418, 418]) {
    t.false(
      failOverStrategy.shouldFailover(mkWeird(statusCode, 0), new Date(base)),
      `Status code ${statusCode} should not cause failover`,
    );
  }
});
