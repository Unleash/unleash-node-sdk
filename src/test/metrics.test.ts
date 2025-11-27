import test from './ava-shim';
import nock from 'nock';
import Metrics from '../metrics';
import type { CollectedMetric } from '../impact-metrics/metric-types';
import { SUPPORTED_SPEC_VERSION } from '../repository';

let counter = 1;
const getUrl = () => `http://test${counter++}.app/`;
const metricsUrl = '/client/metrics';
const nockMetrics = (url: string, code = 200) => nock(url).post(metricsUrl).reply(code, '');
const registerUrl = '/client/register';
const nockRegister = (url: string, code = 200) => nock(url).post(registerUrl).reply(code, '');

test('should be disabled by flag disableMetrics', (t) => {
  // @ts-expect-error
  const metrics = new Metrics({ disableMetrics: true });
  metrics.count('foo', true);

  // @ts-expect-error
  t.true(Object.keys(metrics.bucket.toggles).length === 0);
});

test('registerInstance, sendMetrics, startTimer and count should respect disabled', (t) =>
  new Promise((resolve) => {
    const url = getUrl();
    // @ts-expect-error
    const metrics = new Metrics({
      url,
      disableMetrics: true,
    });
    // @ts-expect-error
    t.true(!metrics.startTimer());
    // @ts-expect-error
    t.true(!metrics.count());
    Promise.all([metrics.registerInstance(), metrics.sendMetrics()]).then((results) => {
      const [registerInstance, sendMetrics] = results;
      t.true(!registerInstance);
      // @ts-expect-error
      t.true(!sendMetrics);
      resolve();
    });
  }));

test('should not start fetch/register when metricsInterval is 0', (t) => {
  const url = getUrl();
  // @ts-expect-error
  const metrics = new Metrics({
    url,
    metricsInterval: 0,
  });

  // @ts-expect-error
  t.true(metrics.timer === undefined);
});

test.skip('should sendMetrics and register when metricsInterval > 0', async (t) => {
  const url = getUrl();
  const regEP = nockRegister(url);
  const metricsEP = nockMetrics(url);
  t.plan(2);
  // @ts-expect-error
  const metrics = new Metrics({
    url,
    metricsInterval: 50,
  });

  const validator = new Promise<void>((resolve) => {
    metrics.on('registered', () => {
      t.true(regEP.isDone());
    });
    metrics.on('sent', () => {
      t.true(metricsEP.isDone());
      metrics.stop();
      resolve();
    });
  });

  metrics.count('toggle-x', true);
  metrics.count('toggle-x', false);
  metrics.count('toggle-y', true);
  metrics.start();
  const timeout = new Promise<void>((resolve) =>
    setTimeout(() => {
      t.fail('Failed to successfully both send and register');
      resolve();
    }, 1000),
  );
  await Promise.race([validator, timeout]);
});

test('should sendMetrics', async (t) => {
  const url = getUrl();
  const metricsEP = nock(url)
    .post(metricsUrl, (payload: any) => {
      t.truthy(payload.bucket);
      t.truthy(payload.bucket.start);
      t.truthy(payload.bucket.stop);
      t.deepEqual(payload.bucket.toggles, {
        'toggle-x': { yes: 1, no: 1, variants: { 'variant-a': 2 } },
        'toggle-y': { yes: 1, no: 0, variants: {} },
      });
      t.deepEqual(payload.connectionId, 'connection-id');
      t.truthy(payload.bucket.toggles['toggle-x']);
      t.truthy(payload.bucket.toggles['toggle-y']);
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
  t.true(regEP.isDone());
  await metrics.sendMetrics();
  t.true(metricsEP.isDone());
});

test('should send correct custom and unleash headers', (t) =>
  new Promise((resolve) => {
    const url = getUrl();
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
      t.true(regEP.isDone());
      t.true(metricsEP.isDone());
      metrics.stop();
      resolve();
    });
    metrics.start();
  }));

test('should send content-type header', async (t) => {
  const url = getUrl();
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
  t.true(regEP.isDone());
  t.true(metricsEP.isDone());
  metrics.stop();
});

test('request with customHeadersFunction should take precedence over customHeaders', async (t) => {
  const url = getUrl();
  const customHeadersKey = `value-${Math.random()}`;
  const randomKey = `value-${Math.random()}`;
  const metricsEP = nockMetrics(url)
    .matchHeader('randomKey', (value: any) => value === undefined)
    .matchHeader('customHeadersKey', customHeadersKey);

  const regEP = nockRegister(url)
    .matchHeader('randomKey', (value: any) => value === undefined)
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
  t.true(metricsEP.isDone());
  t.true(regEP.isDone());
});

test.skip('should respect timeout', (t) =>
  new Promise((resolve, reject) => {
    t.plan(2);
    const url = getUrl();
    nock(url).post(metricsUrl).socketDelay(100).reply(200, '');
    nock(url).post(registerUrl).socketDelay(100).reply(200, '');

    // @ts-expect-error
    const metrics = new Metrics({
      url,
      metricsInterval: 50,
      timeout: 50,
    });

    metrics.on('error', (err) => {
      t.truthy(err);
      t.true(err.message.indexOf('ESOCKETTIMEDOUT') > -1);
      resolve();
    });
    metrics.on('sent', reject);
    metrics.count('toggle-x', true);
    metrics.start();
  }));

test('registerInstance should warn when non 200 statusCode', async (t) => {
  const url = getUrl();
  const regEP = nockRegister(url, 500);

  // @ts-expect-error
  const metrics = new Metrics({
    url,
  });
  metrics.on('error', (e) => {
    t.falsy(e);
  });

  metrics.on('warn', (e) => {
    t.true(regEP.isDone());
    t.truthy(e);
  });

  await metrics.registerInstance();
  metrics.start();
});

test('sendMetrics should backoff on 404', async (t) => {
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
  t.false(metrics.disabled);
  t.is(metrics.getFailures(), 1);
  t.is(metrics.getInterval(), 20);
  await metrics.sendMetrics();
  // @ts-expect-error actually a private field, but we access it for tests
  t.false(metrics.disabled);
  t.is(metrics.getFailures(), 2);
  t.is(metrics.getInterval(), 30);
});

test('sendMetrics should emit warn on non 200 statusCode', (t) =>
  new Promise((resolve) => {
    const url = getUrl();
    const metEP = nockMetrics(url, 500);

    // @ts-expect-error
    const metrics = new Metrics({
      url,
    });

    metrics.on('warn', () => {
      t.true(metEP.isDone());
      resolve();
    });
    metrics.start();

    metrics.count('x-y-z', true);

    metrics.sendMetrics();
  }));

test('sendMetrics should not send empty buckets', async (t) => {
  const url = getUrl();
  const metEP = nockMetrics(url, 200);

  // @ts-expect-error
  const metrics = new Metrics({
    url,
  });
  await metrics.sendMetrics();
  t.false(metEP.isDone());
});

test('count should increment yes and no counters', (t) => {
  const url = getUrl();
  // @ts-expect-error
  const metrics = new Metrics({
    url,
  });
  metrics.start();

  const name = `name-${Math.round(Math.random() * 1000)}`;

  // @ts-expect-error
  t.falsy(metrics.bucket.toggles[name]);

  metrics.count(name, true);

  // @ts-expect-error
  const toggleCount = metrics.bucket.toggles[name];
  t.truthy(toggleCount);
  t.true(toggleCount.yes === 1);
  t.true(toggleCount.no === 0);

  metrics.count(name, true);
  metrics.count(name, true);
  metrics.count(name, false);
  metrics.count(name, false);
  metrics.count(name, false);
  metrics.count(name, false);

  t.true(toggleCount.yes === 3);
  t.true(toggleCount.no === 4);
});

test('count should increment yes and no counters with variants', (t) => {
  const url = getUrl();
  // @ts-expect-error
  const metrics = new Metrics({
    url,
  });
  metrics.start();

  const name = `name-${Math.round(Math.random() * 1000)}`;

  // @ts-expect-error
  t.falsy(metrics.bucket.toggles[name]);

  metrics.count(name, true);

  // @ts-expect-error
  const toggleCount = metrics.bucket.toggles[name];
  t.truthy(toggleCount);
  t.true(toggleCount.yes === 1);
  t.true(toggleCount.no === 0);

  metrics.countVariant(name, 'variant1');
  metrics.countVariant(name, 'variant1');
  metrics.count(name, false);
  metrics.count(name, false);
  metrics.countVariant(name, 'disabled');
  metrics.countVariant(name, 'disabled');
  metrics.countVariant(name, 'variant2');
  metrics.countVariant(name, 'variant2');
  metrics.countVariant(name, 'variant2');

  t.true(toggleCount.yes === 1);
  t.true(toggleCount.no === 2);
  t.true(toggleCount.variants.disabled === 2);
  t.true(toggleCount.variants.variant1 === 2);
  t.true(toggleCount.variants.variant2 === 3);
});

test('getClientData should return a object', (t) => {
  const url = getUrl();
  // @ts-expect-error
  const metrics = new Metrics({
    url,
  });
  metrics.start();

  const result = metrics.getClientData();
  t.true(typeof result === 'object');
});

test('getMetricsData should return a bucket', (t) => {
  const url = getUrl();
  // @ts-expect-error
  const metrics = new Metrics({
    url,
  });
  metrics.start();

  const result = metrics.createMetricsData([]);
  t.true(typeof result === 'object');
  t.true(typeof result.bucket === 'object');
});

test.skip('should keep metrics if send is failing', (t) =>
  new Promise((resolve) => {
    const url = getUrl();
    t.plan(4);
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
      t.is(metrics.bucket.toggles['toggle-x'].yes, 1);
      // @ts-expect-error
      t.is(metrics.bucket.toggles['toggle-x'].no, 1);
      // @ts-expect-error
      t.is(metrics.bucket.toggles['toggle-y'].yes, 2);
      // @ts-expect-error
      t.is(metrics.bucket.toggles['toggle-y'].variants.a, 1);
      resolve();
    });
    metrics.start();
  }));

test('sendMetrics should stop on 401', async (t) => {
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
  t.true(metrics.disabled);
  t.is(metrics.getFailures(), 0);
});
test('sendMetrics should stop on 403', async (t) => {
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
  t.true(metrics.disabled);
  t.is(metrics.getFailures(), 0);
});
test('sendMetrics should backoff on 429', async (t) => {
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
  t.false(metrics.disabled);
  t.is(metrics.getFailures(), 1);
  t.is(metrics.getInterval(), 20);
  await metrics.sendMetrics();
  // @ts-expect-error actually a private field, but we access it for tests
  t.false(metrics.disabled);
  t.is(metrics.getFailures(), 2);
  t.is(metrics.getInterval(), 30);
});

test('sendMetrics should backoff on 500', async (t) => {
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
  t.false(metrics.disabled);
  t.is(metrics.getFailures(), 1);
  t.is(metrics.getInterval(), 20);
  await metrics.sendMetrics();
  // @ts-expect-error actually a private field, but we access it for tests
  t.false(metrics.disabled);
  t.is(metrics.getFailures(), 2);
  t.is(metrics.getInterval(), 30);
});

test('sendMetrics should backoff on 429 and gradually reduce interval', async (t) => {
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
  t.is(metrics.getFailures(), 1);
  t.is(metrics.getInterval(), metricsInterval * 2);
  await metrics.sendMetrics();
  t.is(metrics.getFailures(), 2);
  t.is(metrics.getInterval(), metricsInterval * 3);
  const scope = nockMetrics(url, 200).persist();
  await metrics.sendMetrics();
  // @ts-expect-error actually a private field, but we access it for tests
  t.false(metrics.disabled);
  t.is(metrics.getFailures(), 1);
  t.is(metrics.getInterval(), metricsInterval * 2);
  metrics.count('x-y-z', true);
  metrics.count('x-y-z', true);
  metrics.count('x-y-z', true);
  metrics.count('x-y-z', true);
  await metrics.sendMetrics();
  t.true(scope.isDone());
  // @ts-expect-error actually a private field, but we access it for tests
  t.false(metrics.disabled);
  t.is(metrics.getFailures(), 0);
  t.is(metrics.getInterval(), metricsInterval);
});

test('getClientData should include extended metrics', (t) => {
  const url = getUrl();
  // @ts-expect-error
  const metrics = new Metrics({
    url,
    connectionId: 'connection-id',
  });
  metrics.start();

  const result = metrics.getClientData();
  t.truthy(result.platformName);
  t.truthy(result.platformVersion);
  t.true(result.yggdrasilVersion === null);
  t.true(result.specVersion === SUPPORTED_SPEC_VERSION);
  t.deepEqual(result.connectionId, 'connection-id');
});

test('createMetricsData should include extended metrics', (t) => {
  const url = getUrl();
  // @ts-expect-error
  const metrics = new Metrics({
    url,
  });
  metrics.start();

  const result = metrics.createMetricsData([]);
  t.truthy(result.platformName);
  t.truthy(result.platformVersion);
  t.true(result.yggdrasilVersion === null);
  t.true(result.specVersion === SUPPORTED_SPEC_VERSION);
});

test('createMetricsData should include impactMetrics if provided', (t) => {
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

  t.truthy(result.impactMetrics);
  t.deepEqual(result.impactMetrics, impactMetrics);
});

test('sendMetrics should include impactMetrics in the payload', async (t) => {
  const url = getUrl();
  let capturedBody = null;

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
    .post('/client/metrics', (body: any) => {
      capturedBody = body;
      return true;
    })
    .reply(200);

  await metrics.sendMetrics();
  t.deepEqual(capturedBody!.impactMetrics, [impactMetricSample]);
  t.true(scope.isDone());
});

test('sendMetrics should restore impactMetrics on failure', async (t) => {
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
  t.true(restored);
});

test('sendMetrics should not include impactMetrics field when empty', async (t) => {
  const url = getUrl();
  let capturedBody = null;

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
    .post('/client/metrics', (body: any) => {
      capturedBody = body;
      return true;
    })
    .reply(200);

  await metrics.sendMetrics();
  t.false('impactMetrics' in capturedBody!);
  t.true(scope.isDone());
});
