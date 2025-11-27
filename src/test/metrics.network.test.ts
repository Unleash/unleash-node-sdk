import { test, beforeAll, afterAll } from 'vitest';
import nock from 'nock';
import Metrics from '../metrics';

beforeAll(() => nock.disableNetConnect());
afterAll(() => nock.enableNetConnect());

test('registerInstance should emit error when request error', (t) =>
  new Promise((resolve) => {
    t.plan(2);
    const url = 'http://metrics1.app/';

    // @ts-expect-error
    const metrics = new Metrics({ url });
    metrics.on('warn', (e) => {
      t.truthy(e);
    });

    metrics.registerInstance().then((result) => {
      t.true(result);
      resolve();
    });
  }));

test('sendMetrics should emit error when request error', (t) =>
  new Promise((resolve) => {
    t.plan(1);
    const url = 'http://metrics2.app/';

    // @ts-expect-error
    const metrics = new Metrics({ url });
    metrics.on('warn', (e) => {
      t.truthy(e);
    });

    metrics.count('x', true);

    metrics.sendMetrics().then(() => {
      resolve();
    });
  }));
