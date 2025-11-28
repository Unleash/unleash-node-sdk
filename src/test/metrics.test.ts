import nock from 'nock';
import { expect, test, vi } from 'vitest';
import type { CollectedMetric } from '../impact-metrics/metric-types';
import Metrics from '../metrics';
import { SUPPORTED_SPEC_VERSION } from '../repository';

let counter = 1;
const getUrl = () => `http://test${counter++}.app/`;
const metricsUrl = '/client/metrics';
const nockMetrics = (url: string, code = 200) => nock(url).post(metricsUrl).reply(code, '');
const registerUrl = '/client/register';
const nockRegister = (url: string, code = 200) => nock(url).post(registerUrl).reply(code, '');

test('should be disabled by flag disableMetrics', () => {
  // @ts-expect-error
  const metrics = new Metrics({ disableMetrics: true });
  metrics.count('foo', true);
  //@ts-expect-error bucket isn't a known key
  expect(Object.keys(metrics.bucket.toggles)).toHaveLength(0);
});

test('registerInstance, sendMetrics, startTimer and count should respect disabled', async () => {
  await new Promise<void>((resolve) => {
    const url = getUrl();
    // @ts-expect-error
    const metrics = new Metrics({
      url,
      disableMetrics: true,
    });
    // @ts-expect-error
    expect(metrics.startTimer()).toBeUndefined();
    // @ts-expect-error
    expect(metrics.count()).toBeUndefined();
    Promise.all([metrics.registerInstance(), metrics.sendMetrics()]).then((results) => {
      const [registerInstance, sendMetrics] = results;
      expect(!registerInstance).toBe(true);
      // @ts-expect-error
      expect(!sendMetrics).toBe(true);
      resolve();
    });
  });
});

test('should not start fetch/register when metricsInterval is 0', () => {
  const url = getUrl();
  // @ts-expect-error
  const metrics = new Metrics({
    url,
    metricsInterval: 0,
  });
  // @ts-expect-error timer is not defined by default
  expect(metrics.timer).toBeUndefined();
});

test('should sendMetrics and register when metricsInterval is a positive number', async () => {
  const url = getUrl();
  const regEP = nockRegister(url);
  const metricsEP = nockMetrics(url);
  expect.assertions(2);
  // @ts-expect-error
  const metrics = new Metrics({
    url,
    metricsInterval: 50,
  });

  const validator = new Promise<void>((resolve) => {
    metrics.on('registered', () => {
      expect(regEP.isDone()).toBe(true);
    });
    metrics.on('sent', () => {
      expect(metricsEP.isDone());
      metrics.stop();
      resolve();
    });
  });

  metrics.count('toggle-x', true);
  metrics.count('toggle-x', false);
  metrics.count('toggle-y', true);
  metrics.start();
  await vi.waitFor<void>(() => validator, { timeout: 1000 });
});

test('should sendMetrics', async () => {
  const url = getUrl();
  expect.assertions(7);
  const metricsEP = nock(url)
    .post(metricsUrl, (payload) => {
      expect(payload.bucket).toBeTruthy();
      expect(payload.bucket.start).toBeTruthy();
      expect(payload.bucket.stop).toBeTruthy();
      expect(payload.bucket.toggles).toStrictEqual({
        'toggle-x': { yes: 1, no: 1, variants: { 'variant-a': 2 } },
        'toggle-y': { yes: 1, no: 0, variants: {} },
      });
      expect(payload.connectionId).toStrictEqual('connection-id');
      return true;
    })
    .reply(200, '');
  const regEP = nockRegister(url);

  // @ts-expect-error
  const metrics = new Metrics({
    url,
    metricsInterval: 50,
    connectionId: 'connection-id',
  });

  metrics.count('toggle-x', true);
  metrics.count('toggle-x', false);
  metrics.count('toggle-y', true);
  metrics.countVariant('toggle-x', 'variant-a');
  metrics.countVariant('toggle-x', 'variant-a');

  await metrics.registerInstance();
  expect(regEP.isDone()).toBe(true);
  await metrics.sendMetrics();
  expect(metricsEP.isDone()).toBe(true);
});

test('should send correct custom and unleash headers', async () => {
  await new Promise<void>((resolve) => {
    const url = getUrl();
    expect.assertions(2);
    const randomKey = `value-${Math.random()}`;
    const metricsEP = nockMetrics(url)
      .matchHeader('randomKey', randomKey)
      .matchHeader('unleash-appname', 'appName')
      .matchHeader('unleash-sdk', /^unleash-node-sdk:\d+\.\d+\.\d+/)
      .matchHeader('unleash-connection-id', 'connectionId')
      .matchHeader('unleash-interval', '50');
    const regEP = nockRegister(url)
      .matchHeader('randomKey', randomKey)
      .matchHeader('unleash-appname', 'appName')
      .matchHeader('unleash-sdk', /^unleash-node-sdk:\d+\.\d+\.\d+/)
      .matchHeader('unleash-connection-id', 'connectionId');

    // @ts-expect-error
    const metrics = new Metrics({
      url,
      appName: 'appName',
      connectionId: 'connectionId',
      metricsInterval: 50,
      headers: {
        randomKey,
      },
    });

    metrics.count('toggle-x', true);
    metrics.count('toggle-x', false);
    metrics.count('toggle-y', true);

    metrics.on('sent', () => {
      expect(regEP.isDone()).toBe(true);
      expect(metricsEP.isDone()).toBe(true);
      metrics.stop();
      resolve();
    });
    metrics.start();
  });
});

test('should send content-type header', async () => {
  const url = getUrl();
  expect.assertions(2);
  const metricsEP = nockMetrics(url).matchHeader('content-type', 'application/json');
  const regEP = nockRegister(url).matchHeader('content-type', 'application/json');

  // @ts-expect-error
  const metrics = new Metrics({
    url,
    metricsInterval: 50,
  });

  metrics.count('toggle-x', true);
  await metrics.registerInstance();
  await metrics.sendMetrics();
  expect(regEP.isDone()).toBe(true);
  expect(metricsEP.isDone()).toBe(true);
  metrics.stop();
});

test('request with customHeadersFunction should take precedence over customHeaders', async () => {
  const url = getUrl();
  expect.assertions(2);
  const customHeadersKey = `value-${Math.random()}`;
  const randomKey = `value-${Math.random()}`;
  const metricsEP = nockMetrics(url)
    .matchHeader('randomKey', (value) => value === undefined)
    .matchHeader('customHeadersKey', customHeadersKey);

  const regEP = nockRegister(url)
    .matchHeader('randomKey', (value) => value === undefined)
    .matchHeader('customHeadersKey', customHeadersKey);

  // @ts-expect-error
  const metrics = new Metrics({
    url,
    metricsInterval: 0,
    headers: {
      randomKey,
    },
    customHeadersFunction: () => Promise.resolve({ customHeadersKey }),
  });

  metrics.count('toggle-x', true);
  metrics.count('toggle-x', false);
  metrics.count('toggle-y', true);
  await metrics.registerInstance();
  await metrics.sendMetrics();
  expect(metricsEP.isDone()).toBe(true);
  expect(regEP.isDone()).toBe(true);
});

test.skip('should respect timeout', async () => {
  await new Promise<void>((resolve, reject) => {
    expect.assertions(2);
    const url = getUrl();
    // @ts-expect-error
    nock(url).post(metricsUrl).socketDelay(100).reply(200, '');

    // @ts-expect-error
    nock(url).post(registerUrl).socketDelay(100).reply(200, '');

    // @ts-expect-error
    const metrics = new Metrics({
      url,
      metricsInterval: 50,
      timeout: 50,
    });

    metrics.on('error', (err) => {
      expect(err).toBeTruthy();
      expect(err.message.indexOf('ESOCKETTIMEDOUT') > -1).toBe(true);
      resolve();
    });
    metrics.on('sent', reject);
    metrics.count('toggle-x', true);
    metrics.start();
  });
});

test('registerInstance should warn when non 200 statusCode', async () => {
  expect.assertions(2);
  const url = getUrl();
  const regEP = nockRegister(url, 500);

  // @ts-expect-error
  const metrics = new Metrics({
    url,
  });
  metrics.on('error', (e) => {
    expect(e).toBeFalsy();
  });

  metrics.on('warn', (e) => {
    expect(regEP.isDone()).toBe(true);
    expect(e).toBeTruthy();
  });

  await metrics.registerInstance();
  metrics.start();
});

test('sendMetrics should backoff on 404', async () => {
  const url = getUrl();
  nockMetrics(url, 404).persist();
  const metrics = new Metrics({
    appName: '404-tester',
    instanceId: '404-instance',
    connectionId: '404-connection',
    metricsInterval: 10,
    strategies: [],
    url,
  });
  metrics.count('x-y-z', true);
  await metrics.sendMetrics();
  // @ts-expect-error actually a private field, but we access it for tests
  expect(metrics.disabled).toBe(false);
  expect(metrics.getFailures()).toEqual(1);
  expect(metrics.getInterval()).toEqual(20);
  await metrics.sendMetrics();
  // @ts-expect-error actually a private field, but we access it for tests
  expect(metrics.disabled).toBe(false);
  expect(metrics.getFailures()).toEqual(2);
  expect(metrics.getInterval()).toEqual(30);
});

test('sendMetrics should emit warn on non 200 statusCode', async () => {
  await new Promise<void>((resolve) => {
    const url = getUrl();
    const metEP = nockMetrics(url, 500);

    // @ts-expect-error
    const metrics = new Metrics({
      url,
    });

    metrics.on('warn', () => {
      expect(metEP.isDone()).toBe(true);
      resolve();
    });
    metrics.start();

    metrics.count('x-y-z', true);

    metrics.sendMetrics();
  });
});

test('sendMetrics should not send empty buckets', async () => {
  const url = getUrl();
  const metEP = nockMetrics(url, 200);

  // @ts-expect-error
  const metrics = new Metrics({
    url,
  });
  await metrics.sendMetrics();
  expect(metEP.isDone()).toBe(false);
});

test('count should increment yes and no counters', () => {
  const url = getUrl();
  // @ts-expect-error
  const metrics = new Metrics({
    url,
  });
  metrics.start();

  const name = `name-${Math.round(Math.random() * 1000)}`;

  // @ts-expect-error
  expect(metrics.bucket.toggles[name]).toBeFalsy();

  metrics.count(name, true);

  // @ts-expect-error
  const toggleCount = metrics.bucket.toggles[name];
  expect(toggleCount).toBeTruthy();
  expect(toggleCount.yes === 1).toBe(true);
  expect(toggleCount.no === 0).toBe(true);

  metrics.count(name, true);
  metrics.count(name, true);
  metrics.count(name, false);
  metrics.count(name, false);
  metrics.count(name, false);
  metrics.count(name, false);
  expect(toggleCount.yes).toBe(3);
  expect(toggleCount.no).toBe(4);
});

test('count should increment yes and no counters with variants', () => {
  const url = getUrl();
  // @ts-expect-error
  const metrics = new Metrics({
    url,
  });
  metrics.start();

  const name = `name-${Math.round(Math.random() * 1000)}`;

  // @ts-expect-error
  expect(metrics.bucket.toggles[name]).toBeFalsy();

  metrics.count(name, true);

  // @ts-expect-error
  const toggleCount = metrics.bucket.toggles[name];
  expect(toggleCount).toBeTruthy();
  expect(toggleCount.yes === 1).toBe(true);
  expect(toggleCount.no === 0).toBe(true);

  metrics.countVariant(name, 'variant1');
  metrics.countVariant(name, 'variant1');
  metrics.count(name, false);
  metrics.count(name, false);
  metrics.countVariant(name, 'disabled');
  metrics.countVariant(name, 'disabled');
  metrics.countVariant(name, 'variant2');
  metrics.countVariant(name, 'variant2');
  metrics.countVariant(name, 'variant2');

  expect(toggleCount.yes === 1).toBe(true);
  expect(toggleCount.no === 2).toBe(true);
  expect(toggleCount.variants.disabled === 2).toBe(true);
  expect(toggleCount.variants.variant1 === 2).toBe(true);
  expect(toggleCount.variants.variant2 === 3).toBe(true);
});

test('getClientData should return a object', () => {
  const url = getUrl();
  // @ts-expect-error
  const metrics = new Metrics({
    url,
  });
  metrics.start();

  const result = metrics.getClientData();
  expect(typeof result === 'object').toBe(true);
});

test('getMetricsData should return a bucket', () => {
  const url = getUrl();
  // @ts-expect-error
  const metrics = new Metrics({
    url,
  });
  metrics.start();

  const result = metrics.createMetricsData([]);
  expect(typeof result === 'object').toBe(true);
  expect(typeof result.bucket === 'object').toBe(true);
});

test.skip('should keep metrics if send is failing', async () => {
  await new Promise<void>((resolve) => {
    const url = getUrl();
    expect.assertions(4);
    nock(url).post(metricsUrl).reply(500, '');

    nockRegister(url);

    // @ts-expect-error
    const metrics = new Metrics({
      url,
      metricsInterval: 10,
    });

    metrics.count('toggle-x', true);
    metrics.count('toggle-x', false);

    // variant
    metrics.count('toggle-y', true);
    metrics.countVariant('toggle-y', 'a');

    metrics.on('warn', () => {
      // additional count after warn
      metrics.count('toggle-y', true);

      metrics.stop();
      // @ts-expect-error
      expect(metrics.bucket.toggles['toggle-x'].yes).toEqual(1);
      // @ts-expect-error
      expect(metrics.bucket.toggles['toggle-x'].no).toEqual(1);
      // @ts-expect-error
      expect(metrics.bucket.toggles['toggle-y'].yes).toEqual(2);
      // @ts-expect-error
      expect(metrics.bucket.toggles['toggle-y'].variants.a).toEqual(1);
      resolve();
    });
    metrics.start();
  });
});

test('sendMetrics should stop on 401', async () => {
  const url = getUrl();
  nockMetrics(url, 401);
  const metrics = new Metrics({
    appName: '401-tester',
    instanceId: '401-instance',
    connectionId: '401-connection',
    metricsInterval: 0,
    strategies: [],
    url,
  });
  metrics.count('x-y-z', true);
  await metrics.sendMetrics();
  // @ts-expect-error actually a private field, but we access it for tests
  expect(metrics.disabled).toBe(true);
  expect(metrics.getFailures()).toEqual(0);
});
test('sendMetrics should stop on 403', async () => {
  const url = getUrl();
  nockMetrics(url, 403);
  const metrics = new Metrics({
    appName: '401-tester',
    instanceId: '401-instance',
    connectionId: '401-connection',
    metricsInterval: 0,
    strategies: [],
    url,
  });
  metrics.count('x-y-z', true);
  await metrics.sendMetrics();
  // @ts-expect-error actually a private field, but we access it for tests
  expect(metrics.disabled).toBe(true);
  expect(metrics.getFailures()).toEqual(0);
});
test('sendMetrics should backoff on 429', async () => {
  const url = getUrl();
  nockMetrics(url, 429).persist();
  const metrics = new Metrics({
    appName: '429-tester',
    instanceId: '429-instance',
    connectionId: '429-connection',
    metricsInterval: 10,
    strategies: [],
    url,
  });
  metrics.count('x-y-z', true);
  await metrics.sendMetrics();
  // @ts-expect-error actually a private field, but we access it for tests
  expect(metrics.disabled).toBe(false);
  expect(metrics.getFailures()).toEqual(1);
  expect(metrics.getInterval()).toEqual(20);
  await metrics.sendMetrics();
  // @ts-expect-error actually a private field, but we access it for tests
  expect(metrics.disabled).toBe(false);
  expect(metrics.getFailures()).toEqual(2);
  expect(metrics.getInterval()).toEqual(30);
});

test('sendMetrics should backoff on 500', async () => {
  const url = getUrl();
  nockMetrics(url, 500).persist();
  const metrics = new Metrics({
    appName: '500-tester',
    instanceId: '500-instance',
    connectionId: '500-connetion',
    metricsInterval: 10,
    strategies: [],
    url,
  });
  metrics.count('x-y-z', true);
  await metrics.sendMetrics();
  // @ts-expect-error actually a private field, but we access it for tests
  expect(metrics.disabled).toBe(false);
  expect(metrics.getFailures()).toEqual(1);
  expect(metrics.getInterval()).toEqual(20);
  await metrics.sendMetrics();
  // @ts-expect-error actually a private field, but we access it for tests
  expect(metrics.disabled).toBe(false);
  expect(metrics.getFailures()).toEqual(2);
  expect(metrics.getInterval()).toEqual(30);
});

test('sendMetrics should backoff on 429 and gradually reduce interval', async () => {
  const url = getUrl();
  nock(url).post('/client/metrics').times(2).reply(429);
  const metricsInterval = 60_000;
  const metrics = new Metrics({
    appName: '429-tester',
    instanceId: '429-instance',
    connectionId: '429-connection',
    metricsInterval,
    strategies: [],
    url,
  });
  metrics.count('x-y-z', true);
  await metrics.sendMetrics();
  expect(metrics.getFailures()).toEqual(1);
  expect(metrics.getInterval()).toEqual(metricsInterval * 2);
  await metrics.sendMetrics();
  expect(metrics.getFailures()).toEqual(2);
  expect(metrics.getInterval()).toEqual(metricsInterval * 3);
  const scope = nockMetrics(url, 200).persist();
  await metrics.sendMetrics();
  // @ts-expect-error actually a private field, but we access it for tests
  expect(metrics.disabled).toBe(false);
  expect(metrics.getFailures()).toEqual(1);
  expect(metrics.getInterval()).toEqual(metricsInterval * 2);
  metrics.count('x-y-z', true);
  metrics.count('x-y-z', true);
  metrics.count('x-y-z', true);
  metrics.count('x-y-z', true);
  await metrics.sendMetrics();
  expect(scope.isDone()).toBe(true);
  // @ts-expect-error actually a private field, but we access it for tests
  expect(metrics.disabled).toBe(false);
  expect(metrics.getFailures()).toEqual(0);
  expect(metrics.getInterval()).toEqual(metricsInterval);
});

test('getClientData should include extended metrics', () => {
  const url = getUrl();
  // @ts-expect-error
  const metrics = new Metrics({
    url,
    connectionId: 'connection-id',
  });
  metrics.start();

  const result = metrics.getClientData();
  expect(result.platformName).toBeTruthy();
  expect(result.platformVersion).toBeTruthy();
  expect(result.yggdrasilVersion === null).toBe(true);
  expect(result.specVersion === SUPPORTED_SPEC_VERSION).toBe(true);
  expect(result.connectionId).toStrictEqual('connection-id');
});

test('createMetricsData should include extended metrics', () => {
  const url = getUrl();
  // @ts-expect-error
  const metrics = new Metrics({
    url,
  });
  metrics.start();

  const result = metrics.createMetricsData([]);
  expect(result.platformName).toBeTruthy();
  expect(result.platformVersion).toBeTruthy();
  expect(result.yggdrasilVersion === null).toBe(true);
  expect(result.specVersion === SUPPORTED_SPEC_VERSION).toBe(true);
});

test('createMetricsData should include impactMetrics if provided', () => {
  const url = getUrl();
  // @ts-expect-error
  const metrics = new Metrics({ url });
  metrics.start();

  const impactMetrics: CollectedMetric[] = [
    {
      name: 'feature_toggle_used',
      help: 'tracks toggle usage',
      type: 'counter',
      samples: [{ labels: { toggle: 'new-ui' }, value: 3 }],
    },
  ];

  const result = metrics.createMetricsData(impactMetrics);

  expect(result.impactMetrics).toBeTruthy();
  expect(result.impactMetrics).toStrictEqual(impactMetrics);
});

test('sendMetrics should include impactMetrics in the payload', async () => {
  const url = getUrl();
  let capturedBody: { impactMetrics?: CollectedMetric[] } | undefined;

  const impactMetricSample: CollectedMetric = {
    name: 'feature_toggle_used',
    help: 'tracks toggle usage',
    type: 'counter',
    samples: [{ labels: { toggle: 'some-feature' }, value: 5 }],
  };

  const fakeMetricRegistry = {
    restore: (_metrics: CollectedMetric[]) => {},
    collect: () => [impactMetricSample],
  };

  // @ts-expect-error
  const metrics = new Metrics({
    url,
    metricsInterval: 0,
    metricRegistry: fakeMetricRegistry,
  });

  const scope = nock(url)
    .post('/client/metrics', (body) => {
      capturedBody = body;
      return true;
    })
    .reply(200);

  await metrics.sendMetrics();
  expect(capturedBody?.impactMetrics).toStrictEqual([impactMetricSample]);
  expect(scope.isDone()).toBe(true);
});

test('sendMetrics should restore impactMetrics on failure', async () => {
  const url = getUrl();

  let restored = false;

  const impactMetricSample: CollectedMetric = {
    name: 'feature_toggle_used',
    help: 'tracks toggle usage',
    type: 'counter',
    samples: [{ labels: { toggle: 'fail-case' }, value: 1 }],
  };

  const fakeMetricRegistry = {
    collect: () => [impactMetricSample],
    restore: (_data: CollectedMetric[]) => {
      restored = true;
    },
  };

  // @ts-expect-error
  const metrics = new Metrics({
    url,
    metricsInterval: 0,
    metricRegistry: fakeMetricRegistry,
  });

  nock(url).post('/client/metrics').reply(500);

  await metrics.sendMetrics();
  expect(restored).toBe(true);
});

test('sendMetrics should not include impactMetrics field when empty', async () => {
  const url = getUrl();
  let capturedBody: Record<string, unknown> | null = null;

  const fakeMetricRegistry = {
    collect: () => [],
    restore: (_: CollectedMetric[]) => {},
  };

  // @ts-expect-error
  const metrics = new Metrics({
    url,
    metricsInterval: 0,
    metricRegistry: fakeMetricRegistry,
  });

  // Inject a single toggle evaluation so that we force a metrics send but without impact metrics
  metrics.count('toggle-x', true);

  const scope = nock(url)
    .post('/client/metrics', (body) => {
      capturedBody = body;
      return true;
    })
    .reply(200);

  await metrics.sendMetrics();
  expect(Boolean(capturedBody && 'impactMetrics' in capturedBody)).toBe(false);
  expect(scope.isDone()).toBe(true);
});
