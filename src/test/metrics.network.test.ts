import nock from 'nock';
import { afterEach, beforeEach, expect, test } from 'vitest';
import Metrics from '../metrics';

beforeEach(() => nock.disableNetConnect());
afterEach(() => nock.enableNetConnect());

test('registerInstance should emit error when request error', async () => {
  await new Promise<void>((resolve) => {
    expect.assertions(2);
    const url = 'http://metrics1.app/';

    // @ts-expect-error
    const metrics = new Metrics({ url });
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

    // @ts-expect-error
    const metrics = new Metrics({ url });
    metrics.on('warn', (e) => {
      expect(e).toBeTruthy();
    });

    metrics.count('x', true);

    metrics.sendMetrics().then(() => {
      resolve();
    });
  });
});
