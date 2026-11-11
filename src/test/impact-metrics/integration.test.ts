import { once } from 'node:events';
import nock from 'nock';
import { afterEach, expect, test, vi } from 'vitest';
import { client, FakeFetcher, state } from '../fixtures';

afterEach(() => nock.cleanAll());

test('flushes impact metrics with unlabelled samples alongside automatic evaluation counts', async () => {
  const sdk = client({
    disableMetrics: false,
    metricsInterval: 0,
    environment: 'production',
    fetcher: new FakeFetcher(state()),
  });
  const counts = vi.fn();
  sdk.on('count', counts);
  const synchronized = once(sdk, 'synchronized');
  await sdk.start();
  await synchronized;
  sdk.impactMetrics.defineCounter('requests', 'Request count');
  sdk.impactMetrics.defineGauge('connections', 'Open connections');
  sdk.impactMetrics.defineHistogram('latency', 'Request latency', [1, 5]);
  sdk.impactMetrics.incrementCounter('requests');
  sdk.impactMetrics.incrementCounter('requests', 2);
  sdk.impactMetrics.updateGauge('connections', 4);
  sdk.impactMetrics.observeHistogram('latency', 3);
  sdk.isEnabled('feature');
  sdk.getVariant('feature');
  sdk.isEnabled('missing');
  const posted = nock('http://unleash.test')
    .post('/api/client/metrics', (body) => {
      expect(body.bucket.toggles).toEqual({
        feature: { yes: 2, no: 0, variants: { disabled: 1 } },
        missing: { yes: 0, no: 1, variants: {} },
      });
      expect(body.impactMetrics).toEqual(
        expect.arrayContaining([
          {
            name: 'requests',
            help: 'Request count',
            type: 'counter',
            samples: [{ labels: {}, value: 3 }],
          },
          {
            name: 'connections',
            help: 'Open connections',
            type: 'gauge',
            samples: [{ labels: {}, value: 4 }],
          },
          {
            name: 'latency',
            help: 'Request latency',
            type: 'histogram',
            samples: [
              {
                labels: {},
                count: 1,
                sum: 3,
                buckets: [
                  { le: 1, count: 0 },
                  { le: 5, count: 1 },
                  { le: '+Inf', count: 1 },
                ],
              },
            ],
          },
        ]),
      );
      return true;
    })
    .reply(200);
  await sdk.flushMetrics();
  expect(posted.isDone()).toBe(true);
  expect(counts.mock.calls).toEqual([
    ['feature', true],
    ['feature', true],
    ['missing', false],
  ]);
});

test('disabled sending suppresses count events and posts while evaluations still work', async () => {
  const sdk = client({ fetcher: new FakeFetcher(state()) });
  const count = vi.fn();
  sdk.on('count', count);
  const synchronized = once(sdk, 'synchronized');
  await sdk.start();
  await synchronized;
  expect(sdk.isEnabled('feature')).toBe(true);
  expect(sdk.getVariant('feature').feature_enabled).toBe(true);
  await sdk.flushMetrics();
  expect(count).not.toHaveBeenCalled();
});
