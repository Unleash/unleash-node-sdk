import assert from 'node:assert/strict';
import type { CollectedMetric } from '@unleash/yggdrasil-engine';
import { getSpecVersion, UnleashEngine } from '@unleash/yggdrasil-engine';
import nock from 'nock';
import { afterEach, expect, test, vi } from 'vitest';
import type { MetricsOptions } from '../metrics';
import Metrics from '../metrics';

const SUPPORTED_SPEC_VERSION = getSpecVersion();
const instances: { metrics: Metrics; engine: UnleashEngine }[] = [];
function createMetrics(options: Partial<MetricsOptions> = {}) {
  const engine = new UnleashEngine();
  const metrics = new Metrics({
    appName: 'test',
    instanceId: 'test',
    connectionId: 'test',
    strategies: [],
    metricsInterval: 0,
    url: 'http://metrics.test/',
    ...options,
    engine,
  });
  instances.push({ metrics, engine });
  return { metrics, engine };
}
afterEach(() => {
  for (const { metrics, engine } of instances.splice(0)) {
    metrics.stop();
    engine.destroy();
  }
  nock.cleanAll();
});

let counter = 1;
const getUrl = () => `http://test${counter++}.app/`;
const metricsUrl = '/client/metrics';
const nockMetrics = (url: string, code = 200) => nock(url).post(metricsUrl).reply(code, '');
const registerUrl = '/client/register';
const nockRegister = (url: string, code = 200) => nock(url).post(registerUrl).reply(code, '');

test('registerInstance, sendMetrics and startTimer should respect disabled', async () => {
  await new Promise<void>((resolve) => {
    const url = getUrl();
    const { metrics } = createMetrics({
      url,
      disableMetrics: true,
    });
    // @ts-expect-error
    expect(metrics.startTimer()).toBeUndefined();
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
  const { metrics } = createMetrics({
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
  const { metrics, engine } = createMetrics({
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

  engine.count('toggle-x', true);
  engine.count('toggle-x', false);
  engine.count('toggle-y', true);
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

  const { metrics, engine } = createMetrics({
    url,
    metricsInterval: 50,
    connectionId: 'connection-id',
  });

  engine.count('toggle-x', true);
  engine.count('toggle-x', false);
  engine.count('toggle-y', true);
  engine.countVariant('toggle-x', 'variant-a');
  engine.countVariant('toggle-x', 'variant-a');

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

    const { metrics, engine } = createMetrics({
      url,
      appName: 'appName',
      connectionId: 'connectionId',
      metricsInterval: 50,
      headers: {
        randomKey,
      },
    });

    engine.count('toggle-x', true);
    engine.count('toggle-x', false);
    engine.count('toggle-y', true);

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

  const { metrics, engine } = createMetrics({
    url,
    metricsInterval: 50,
  });

  engine.count('toggle-x', true);
  await metrics.registerInstance();
  await metrics.sendMetrics();
  expect(regEP.isDone()).toBe(true);
  expect(metricsEP.isDone()).toBe(true);
  metrics.stop();
});

test('sdkFlavor exists in the register and metrics request bodies', async () => {
  const url = getUrl();
  expect.assertions(2);

  const regEP = nock(url)
    .post(
      registerUrl,
      (body) =>
        body.sdkFlavor === 'unleash-openfeature-node-provider' &&
        body.sdkFlavorVersion === '1.2.3' &&
        body.sdkVersion !== body.sdkFlavorVersion, // the SDK version is still there
    )
    .reply(200, '');

  const metricsEP = nock(url)
    .post(
      metricsUrl,
      (body) =>
        body.sdkFlavor === 'unleash-openfeature-node-provider' && body.sdkFlavorVersion === '1.2.3',
    )
    .reply(200, '');

  const { metrics, engine } = createMetrics({
    url,
    metricsInterval: 50,
    sdkFlavor: 'unleash-openfeature-node-provider',
    sdkFlavorVersion: '1.2.3',
  });

  engine.count('toggle-x', true);
  await metrics.registerInstance();
  await metrics.sendMetrics();

  expect(regEP.isDone()).toBe(true);
  expect(metricsEP.isDone()).toBe(true);
  metrics.stop();
});

test('sdkFlavor is absent from request bodies when not configured', async () => {
  const url = getUrl();
  expect.assertions(2);

  const regEP = nock(url)
    .post(registerUrl, (body) => !('sdkFlavor' in body) && !('sdkFlavorVersion' in body))
    .reply(200, '');
  const metricsEP = nock(url)
    .post(metricsUrl, (body) => !('sdkFlavor' in body) && !('sdkFlavorVersion' in body))
    .reply(200, '');

  const { metrics, engine } = createMetrics({
    url,
    metricsInterval: 50,
  });

  engine.count('toggle-x', true);
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

  const { metrics, engine } = createMetrics({
    url,
    metricsInterval: 0,
    headers: {
      randomKey,
    },
    customHeadersFunction: () => Promise.resolve({ customHeadersKey }),
  });

  engine.count('toggle-x', true);
  engine.count('toggle-x', false);
  engine.count('toggle-y', true);
  await metrics.registerInstance();
  await metrics.sendMetrics();
  expect(metricsEP.isDone()).toBe(true);
  expect(regEP.isDone()).toBe(true);
});

test('should respect timeout', async () => {
  await new Promise<void>((resolve, reject) => {
    expect.assertions(2);
    const url = getUrl();
    nock(url).post(metricsUrl).delay(100).reply(200, '');
    nock(url).post(registerUrl).delay(100).reply(200, '');

    const { metrics, engine } = createMetrics({
      url,
      metricsInterval: 50,
      timeout: 50,
    });

    metrics.once('warn', (err) => {
      expect(err).toBeTruthy();
      expect(err.message.indexOf('network timeout at') > -1).toBe(true);
      resolve();
    });
    metrics.on('sent', reject);
    engine.count('toggle-x', true);
    metrics.start();
  });
});

test('registerInstance should warn when non 200 statusCode', async () => {
  expect.assertions(2);
  const url = getUrl();
  const regEP = nockRegister(url, 500);

  const { metrics } = createMetrics({
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
  const { metrics, engine } = createMetrics({
    appName: '404-tester',
    instanceId: '404-instance',
    connectionId: '404-connection',
    metricsInterval: 10,
    strategies: [],
    url,
  });
  engine.count('x-y-z', true);
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

    const { metrics, engine } = createMetrics({
      url,
    });

    metrics.on('warn', () => {
      expect(metEP.isDone()).toBe(true);
      resolve();
    });
    metrics.start();

    engine.count('x-y-z', true);

    metrics.sendMetrics();
  });
});

test('sendMetrics should not send empty buckets', async () => {
  const url = getUrl();
  const metEP = nockMetrics(url, 200);

  const { metrics } = createMetrics({
    url,
  });
  await metrics.sendMetrics();
  expect(metEP.isDone()).toBe(false);
});

test('getClientData should return a object', () => {
  const url = getUrl();
  const { metrics } = createMetrics({
    url,
  });
  metrics.start();

  const result = metrics.getClientData();
  expect(typeof result === 'object').toBe(true);
});

test('should keep metrics if send is failing', async () => {
  await new Promise<void>((resolve) => {
    const url = getUrl();
    expect.assertions(4);
    nock(url).post(metricsUrl).reply(500, '');

    nockRegister(url);

    const { metrics, engine } = createMetrics({
      url,
      metricsInterval: 10,
    });

    engine.count('toggle-x', true);
    engine.count('toggle-x', false);

    // variant
    engine.count('toggle-y', true);
    engine.countVariant('toggle-y', 'a');

    metrics.on('warn', () => {
      // additional count after warn
      engine.count('toggle-y', true);

      metrics.stop();
      const bucket = engine.getMetrics().bucket;
      assert(bucket);
      expect(bucket.toggles['toggle-x'].yes).toEqual(1);
      expect(bucket.toggles['toggle-x'].no).toEqual(1);
      expect(bucket.toggles['toggle-y'].yes).toEqual(2);
      expect(bucket.toggles['toggle-y'].variants?.a).toEqual(1);
      resolve();
    });

    metrics.start();
  });
});

test('sendMetrics should stop on 401', async () => {
  const url = getUrl();
  nockMetrics(url, 401);
  const { metrics, engine } = createMetrics({
    appName: '401-tester',
    instanceId: '401-instance',
    connectionId: '401-connection',
    metricsInterval: 0,
    strategies: [],
    url,
  });
  engine.count('x-y-z', true);
  await metrics.sendMetrics();
  // @ts-expect-error actually a private field, but we access it for tests
  expect(metrics.disabled).toBe(true);
  expect(metrics.getFailures()).toEqual(0);
});
test('sendMetrics should stop on 403', async () => {
  const url = getUrl();
  nockMetrics(url, 403);
  const { metrics, engine } = createMetrics({
    appName: '401-tester',
    instanceId: '401-instance',
    connectionId: '401-connection',
    metricsInterval: 0,
    strategies: [],
    url,
  });
  engine.count('x-y-z', true);
  await metrics.sendMetrics();
  // @ts-expect-error actually a private field, but we access it for tests
  expect(metrics.disabled).toBe(true);
  expect(metrics.getFailures()).toEqual(0);
});
test('sendMetrics should backoff on 429', async () => {
  const url = getUrl();
  nockMetrics(url, 429).persist();
  const { metrics, engine } = createMetrics({
    appName: '429-tester',
    instanceId: '429-instance',
    connectionId: '429-connection',
    metricsInterval: 10,
    strategies: [],
    url,
  });
  engine.count('x-y-z', true);
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
  const { metrics, engine } = createMetrics({
    appName: '500-tester',
    instanceId: '500-instance',
    connectionId: '500-connetion',
    metricsInterval: 10,
    strategies: [],
    url,
  });
  engine.count('x-y-z', true);
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
  const { metrics, engine } = createMetrics({
    appName: '429-tester',
    instanceId: '429-instance',
    connectionId: '429-connection',
    metricsInterval,
    strategies: [],
    url,
  });
  engine.count('x-y-z', true);
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
  engine.count('x-y-z', true);
  engine.count('x-y-z', true);
  engine.count('x-y-z', true);
  engine.count('x-y-z', true);
  await metrics.sendMetrics();
  expect(scope.isDone()).toBe(true);
  // @ts-expect-error actually a private field, but we access it for tests
  expect(metrics.disabled).toBe(false);
  expect(metrics.getFailures()).toEqual(0);
  expect(metrics.getInterval()).toEqual(metricsInterval);
});

test('getClientData should include extended metrics', () => {
  const url = getUrl();
  const { metrics } = createMetrics({
    url,
    connectionId: 'connection-id',
  });
  metrics.start();

  const result = metrics.getClientData();
  expect(result.platformName).toBeTruthy();
  expect(result.platformVersion).toBeTruthy();
  expect(result.yggdrasilVersion).toBeTruthy();
  expect(result.specVersion === SUPPORTED_SPEC_VERSION).toBe(true);
  expect(result.connectionId).toStrictEqual('connection-id');
});

test('count should increment yes and no counters', () => {
  const url = getUrl();
  const { metrics, engine } = createMetrics({
    url,
  });
  metrics.start();

  const name = `name-${Math.round(Math.random() * 1000)}`;
  expect(engine.getMetrics().bucket?.toggles[name]).toBeFalsy();

  engine.count(name, true);
  const bucket = engine.getMetrics();
  assert(bucket.bucket);
  let toggleCount = bucket.bucket.toggles[name];
  engine.restoreMetrics(bucket);
  expect(toggleCount).toBeTruthy();
  expect(toggleCount.yes === 1).toBe(true);
  expect(toggleCount.no === 0).toBe(true);

  engine.count(name, true);
  engine.count(name, true);
  engine.count(name, false);
  engine.count(name, false);
  engine.count(name, false);
  engine.count(name, false);
  const finalBucket = engine.getMetrics().bucket;
  assert(finalBucket);
  toggleCount = finalBucket.toggles[name];
  expect(toggleCount.yes).toBe(3);
  expect(toggleCount.no).toBe(4);
});

test('count should increment yes and no counters with variants', () => {
  const url = getUrl();
  const { metrics, engine } = createMetrics({
    url,
  });
  metrics.start();

  const name = `name-${Math.round(Math.random() * 1000)}`;
  expect(engine.getMetrics().bucket?.toggles[name]).toBeFalsy();

  engine.count(name, true);
  const bucket = engine.getMetrics();
  assert(bucket.bucket);
  let toggleCount = bucket.bucket.toggles[name];
  engine.restoreMetrics(bucket);
  expect(toggleCount).toBeTruthy();
  expect(toggleCount.yes === 1).toBe(true);
  expect(toggleCount.no === 0).toBe(true);

  engine.countVariant(name, 'variant1');
  engine.countVariant(name, 'variant1');
  engine.count(name, false);
  engine.count(name, false);
  engine.countVariant(name, 'disabled');
  engine.countVariant(name, 'disabled');
  engine.countVariant(name, 'variant2');
  engine.countVariant(name, 'variant2');
  engine.countVariant(name, 'variant2');

  const finalBucket = engine.getMetrics().bucket;
  assert(finalBucket);
  toggleCount = finalBucket.toggles[name];
  expect(toggleCount.yes === 1).toBe(true);
  expect(toggleCount.no === 2).toBe(true);
  expect(toggleCount.variants?.disabled === 2).toBe(true);
  expect(toggleCount.variants?.variant1 === 2).toBe(true);
  expect(toggleCount.variants?.variant2 === 3).toBe(true);
});

test('sendMetrics should include impactMetrics in the payload', async () => {
  const url = getUrl();
  let capturedBody: { impactMetrics?: CollectedMetric[] } | undefined;

  const impactMetricSample: CollectedMetric = {
    name: 'feature_toggle_used',
    help: 'tracks toggle usage',
    type: 'counter',
    samples: [{ labels: {}, value: 5 }],
  };

  const { metrics, engine } = createMetrics({
    url,
    metricsInterval: 0,
  });

  const scope = nock(url)
    .post('/client/metrics', (body) => {
      capturedBody = body;
      return true;
    })
    .reply(200);

  engine.defineCounter(impactMetricSample.name, impactMetricSample.help);
  engine.incrementCounter(
    impactMetricSample.name,
    'value' in impactMetricSample.samples[0] ? impactMetricSample.samples[0].value : 0,
  );
  await metrics.sendMetrics();
  expect(capturedBody?.impactMetrics).toStrictEqual([impactMetricSample]);
  expect(scope.isDone()).toBe(true);
});

test('sendMetrics should restore impactMetrics on failure', async () => {
  const url = getUrl();

  const impactMetricSample: CollectedMetric = {
    name: 'feature_toggle_used',
    help: 'tracks toggle usage',
    type: 'counter',
    samples: [{ labels: {}, value: 1 }],
  };

  const { metrics, engine } = createMetrics({
    url,
    metricsInterval: 0,
  });

  nock(url).post('/client/metrics').reply(500);

  engine.defineCounter(impactMetricSample.name, impactMetricSample.help);
  engine.incrementCounter(
    impactMetricSample.name,
    'value' in impactMetricSample.samples[0] ? impactMetricSample.samples[0].value : 0,
  );
  await metrics.sendMetrics();
  expect(engine.getMetrics().impactMetrics).toStrictEqual([impactMetricSample]);
});
