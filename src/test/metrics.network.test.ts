import { UnleashEngine } from '@unleash/yggdrasil-engine';
import nock from 'nock';
import { afterEach, beforeEach, expect, test } from 'vitest';
import Metrics from '../metrics';

const engines: UnleashEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.destroy();
});

beforeEach(() => nock.disableNetConnect());
afterEach(() => nock.enableNetConnect());

test('registerInstance should emit error when request error', async () => {
  await new Promise<void>((resolve) => {
    expect.assertions(2);
    const url = 'http://metrics1.app/';

    const engine = new UnleashEngine();
    engines.push(engine);
    const metrics = new Metrics({
      url,
      engine,
      appName: 'test',
      instanceId: 'test',
      connectionId: 'test',
      strategies: [],
      metricsInterval: 0,
    });
    metrics.on('warn', (e) => {
      expect(e).toBeTruthy();
    });

    metrics.registerInstance().then((result) => {
      expect(result).toBe(true);
      resolve();
    });
  });
});

test('sendMetrics should emit error when request error', async () => {
  await new Promise<void>((resolve) => {
    expect.assertions(1);
    const url = 'http://metrics2.app/';

    const engine = new UnleashEngine();
    engines.push(engine);
    const metrics = new Metrics({
      url,
      engine,
      appName: 'test',
      instanceId: 'test',
      connectionId: 'test',
      strategies: [],
      metricsInterval: 0,
    });
    metrics.on('warn', (e) => {
      expect(e).toBeTruthy();
    });

    engine.count('x', true);

    metrics.sendMetrics().then(() => {
      resolve();
    });
  });
});
