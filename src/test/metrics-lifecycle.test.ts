import { UnleashEngine } from '@unleash/yggdrasil-engine';
import nock from 'nock';
import { afterEach, expect, test, vi } from 'vitest';
import Metrics, { type MetricsOptions } from '../metrics';

const active: Array<{ metrics: Metrics; engine: UnleashEngine }> = [];
function setup(options: Partial<MetricsOptions> = {}) {
  const engine = new UnleashEngine();
  const metrics = new Metrics({
    appName: 'metrics-test',
    instanceId: 'instance',
    connectionId: 'connection',
    strategies: ['default'],
    metricsInterval: 0,
    url: 'http://metrics.test/api/',
    engine,
    ...options,
  });
  active.push({ metrics, engine });
  return { metrics, engine };
}

afterEach(() => {
  for (const { metrics, engine } of active.splice(0)) {
    metrics.stop();
    engine.destroy();
  }
  vi.useRealTimers();
  nock.cleanAll();
});

test('disabled metrics skip registration/sending without draining engine counts', async () => {
  const { metrics, engine } = setup({ disableMetrics: true, metricsInterval: 100 });
  const post = nock('http://metrics.test').post(/.*/).reply(200);
  engine.count('flag', true);
  metrics.start();
  expect(await metrics.registerInstance()).toBe(false);
  await metrics.sendMetrics();
  expect(post.isDone()).toBe(false);
  expect(engine.getMetrics().bucket?.toggles.flag.yes).toBe(1);
});

test('zero interval does not automatically register, but supports explicit flushing', async () => {
  const { metrics, engine } = setup();
  const registration = nock('http://metrics.test').post('/api/client/register').reply(200);
  const posted = nock('http://metrics.test').post('/api/client/metrics').reply(200);
  metrics.start();
  engine.count('flag', true);
  await metrics.sendMetrics();
  expect(registration.isDone()).toBe(false);
  expect(posted.isDone()).toBe(true);
});

test('an idle interval keeps scheduling subsequent metric checks', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  const { metrics } = setup({ metricsInterval: 1000 });
  const posted = nock('http://metrics.test').post('/api/client/metrics').reply(200);
  await metrics.sendMetrics();
  const send = vi.spyOn(metrics, 'sendMetrics');
  await vi.advanceTimersByTimeAsync(1000);
  await vi.advanceTimersByTimeAsync(1000);
  expect(send).toHaveBeenCalledTimes(2);
  expect(posted.isDone()).toBe(false);
  metrics.stop();
  await vi.advanceTimersByTimeAsync(1000);
  expect(send).toHaveBeenCalledTimes(2);
});

test('dynamic headers override static headers and are refreshed for each request', async () => {
  let token = 0;
  const { metrics, engine } = setup({
    headers: { Authorization: 'stale' },
    customHeadersFunction: async () => ({ Authorization: `token-${++token}` }),
  });
  const registration = nock('http://metrics.test')
    .post('/api/client/register')
    .matchHeader('authorization', 'token-1')
    .reply(200);
  const posted = nock('http://metrics.test')
    .post('/api/client/metrics')
    .matchHeader('authorization', 'token-2')
    .reply(200);
  engine.count('flag', true);
  await metrics.registerInstance();
  await metrics.sendMetrics();
  expect(registration.isDone()).toBe(true);
  expect(posted.isDone()).toBe(true);
});

test('failed header refresh retains counts, warns, and reschedules', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  const headers = vi
    .fn()
    .mockRejectedValueOnce(new Error('token refresh failed'))
    .mockResolvedValue({ Authorization: 'fresh' });
  const { metrics, engine } = setup({ metricsInterval: 1000, customHeadersFunction: headers });
  const warn = vi.fn();
  metrics.on('warn', warn);
  engine.count('flag', true);
  await metrics.sendMetrics();
  expect(warn).toHaveBeenCalledWith(expect.objectContaining({ message: 'token refresh failed' }));
  expect(vi.getTimerCount()).toBe(1);
  const posted = nock('http://metrics.test')
    .post('/api/client/metrics', (body) => body.bucket.toggles.flag.yes === 1)
    .reply(200);
  await metrics.sendMetrics();
  expect(posted.isDone()).toBe(true);
});

test.each([404, 429, 500, 502, 503, 504])(
  'backs off and restores counts after HTTP %s',
  async (status) => {
    const { metrics, engine } = setup({ metricsInterval: 1000 });
    nock('http://metrics.test').post('/api/client/metrics').reply(status);
    engine.count('flag', true);
    await metrics.sendMetrics();
    expect(metrics.isEnabled()).toBe(true);
    expect(metrics.getFailures()).toBe(1);
    expect(metrics.getInterval()).toBe(2000);
    engine.count('flag', true);
    const posted = nock('http://metrics.test')
      .post('/api/client/metrics', (body) => body.bucket.toggles.flag.yes === 2)
      .reply(200);
    await metrics.sendMetrics();
    expect(posted.isDone()).toBe(true);
    expect(metrics.getFailures()).toBe(0);
  },
);

test.each([401, 403])(
  'stops sending on HTTP %s while leaving restored counts intact',
  async (status) => {
    const { metrics, engine } = setup({ metricsInterval: 1000 });
    const warn = vi.fn();
    metrics.on('warn', warn);
    const posted = nock('http://metrics.test').post('/api/client/metrics').reply(status);
    engine.count('flag', true);
    await metrics.sendMetrics();
    expect(posted.isDone()).toBe(true);
    expect(metrics.isEnabled()).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('stopping metrics'));
    expect(engine.getMetrics().bucket?.toggles.flag.yes).toBe(1);
  },
);

test('registration catches header failures and non-success responses', async () => {
  const { metrics } = setup({
    customHeadersFunction: async () => {
      throw new Error('headers unavailable');
    },
  });
  const warn = vi.fn();
  metrics.on('warn', warn);
  await metrics.registerInstance();
  expect(warn).toHaveBeenCalledWith(expect.objectContaining({ message: 'headers unavailable' }));
  const other = setup().metrics;
  const statusWarning = vi.fn();
  other.on('warn', statusWarning);
  nock('http://metrics.test').post('/api/client/register').reply(500, 'unavailable');
  await other.registerInstance();
  expect(statusWarning).toHaveBeenCalledWith(
    expect.stringContaining('returning 500'),
    'unavailable',
  );
});

test('stop during header refresh prevents accessing a freed engine', async () => {
  let resolveHeaders!: (headers: Record<string, string>) => void;
  const headers = new Promise<Record<string, string>>((resolve) => {
    resolveHeaders = resolve;
  });
  const { metrics, engine } = setup({ customHeadersFunction: () => headers });
  engine.count('flag', true);
  const pending = metrics.sendMetrics();
  metrics.stop();
  engine.destroy();
  resolveHeaders({});
  await expect(pending).resolves.toBeUndefined();
});

test('stop during an in-flight failed post prevents restoring into a freed engine', async () => {
  let respond!: () => void;
  let requested!: () => void;
  const response = new Promise<void>((resolve) => {
    respond = resolve;
  });
  const request = new Promise<void>((resolve) => {
    requested = resolve;
  });
  nock('http://metrics.test')
    .post('/api/client/metrics')
    .reply(async () => {
      requested();
      await response;
      return [500, 'unavailable'];
    });
  const { metrics, engine } = setup();
  engine.count('flag', true);
  const pending = metrics.sendMetrics();
  await request;
  metrics.stop();
  engine.destroy();
  respond();
  await expect(pending).resolves.toBeUndefined();
});
