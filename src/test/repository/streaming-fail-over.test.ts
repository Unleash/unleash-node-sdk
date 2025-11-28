import { expect, test } from 'vitest';
import { type FailEvent, FailoverStrategy } from '../../repository/streaming-fail-over';

test('fails over immediately when server requests it', () => {
  const failOverStrategy = new FailoverStrategy(3, 10_000);

  const now = new Date('2024-01-01T00:00:00Z');

  const event: FailEvent = {
    type: 'server-hint',
    event: 'polling',
    message: 'Unleash has requested failover to polling',
    occurredAt: now,
  };

  expect(failOverStrategy.shouldFailover(event, now)).toBe(true);
});

test('does not fail over on arbitrary server events', () => {
  const failOverStrategy = new FailoverStrategy(3, 10_000);

  const now = new Date('2024-01-01T00:00:00Z');

  const event: FailEvent = {
    type: 'server-hint',
    event: 'a-new-and-exciting-unsupported-event',
    occurredAt: now,
    message: 'Service should frob the wranglebinder now',
  };

  expect(failOverStrategy.shouldFailover(event, now)).toBe(false);
});

test('fails over immediately on hard http status codes', () => {
  const failOverStrategy = new FailoverStrategy(3, 10_000);

  const now = new Date('2024-01-01T00:00:00Z');

  for (const statusCode of [401, 403, 404, 429]) {
    const event: FailEvent = {
      type: 'http-status-error',
      statusCode,
      occurredAt: now,
      message: `HTTP status error with status code ${statusCode}`,
    };

    expect(failOverStrategy.shouldFailover(event, now)).toBe(true);
  }
});

test('soft errors accumulate to failover within relax window', () => {
  const failOverStrategy = new FailoverStrategy(3, 60_000);
  const base = Date.UTC(1867, 10, 7, 0, 0, 0);

  const mkEvent = (offsetMs: number): FailEvent => ({
    type: 'http-status-error',
    statusCode: 503,
    occurredAt: new Date(base + offsetMs),
    message: `HTTP status error with status code 503`,
  });

  expect(
    failOverStrategy.shouldFailover(mkEvent(0), new Date(base)),
    'Should not failover on first soft error',
  ).toBe(false);

  expect(
    failOverStrategy.shouldFailover(mkEvent(1000), new Date(base + 1000)),
    'Should not failover on second soft error',
  ).toBe(false);

  // this is within the sliding window threshold so it's time to failover
  expect(
    failOverStrategy.shouldFailover(mkEvent(2000), new Date(base + 2000)),
    'Should failover on third soft error within relax window',
  ).toBe(true);
});

test('soft errors are pruned error window and do not cause failover', () => {
  const failOverStrategy = new FailoverStrategy(3, 1_000);
  const base = Date.UTC(1867, 10, 7, 0, 0, 0);

  const mkEvent = (offsetMs: number): FailEvent => ({
    type: 'http-status-error',
    statusCode: 502,
    occurredAt: new Date(base + offsetMs),
    message: `HTTP status error with status code 502`,
  });

  expect(
    failOverStrategy.shouldFailover(mkEvent(0), new Date(base)),
    'First soft error should not trigger failover',
  ).toBe(false);

  expect(
    failOverStrategy.shouldFailover(mkEvent(2000), new Date(base + 2000)),
    'Second soft error after window should not trigger failover',
  ).toBe(false);

  // event 3 lands outside the window that event 1 lands is so it's safe
  expect(
    failOverStrategy.shouldFailover(mkEvent(3000), new Date(base + 3000)),
    'Third soft error should still not trigger failover since previous ones aged out',
  ).toBe(false);
});

test('unhandled HTTP status codes never trigger failover', () => {
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
    expect(
      failOverStrategy.shouldFailover(mkWeird(statusCode, 0), new Date(base)),
      `Status code ${statusCode} should not cause failover`,
    ).toBe(false);
  }
});
