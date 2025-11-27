import test from './test-shim';
import * as nock from 'nock';
import { tmpdir } from 'os';
import { join } from 'path';
import { Unleash } from '../unleash';

test('should emit network errors', (t) =>
  new Promise((resolve) => {
    nock.disableNetConnect();
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
      t.truthy(e);
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
  }));
