import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as nock from 'nock';
import { expect, test } from 'vitest';
import { Unleash } from '../unleash';

test('should emit network errors', async () => {
  await new Promise<void>((resolve) => {
    nock.disableNetConnect();
    expect.assertions(3);
    const backupPath = join(tmpdir(), `test-tmp-${Math.round(Math.random() * 100000)}`);
    const unleash = new Unleash({
      appName: 'network',
      url: 'http://blocked.app',
      timeout: 1,
      refreshInterval: 20000,
      metricsInterval: 20000,
      disableMetrics: false,
      backupPath,
    });

    unleash.on('warn', (e) => {
      expect(e).toBeTruthy();
    });

    unleash.on('error', () => {
      // silence
    });

    unleash.isEnabled('some-toggle');
    // @ts-expect-error
    unleash.metrics.sendMetrics();

    setTimeout(() => {
      unleash.destroy();
      process.nextTick(() => {
        nock.enableNetConnect();
        resolve();
      });
    }, 1000);
  });
});
