import nock from 'nock';
import { expect, test } from 'vitest';
import { Unleash } from '../unleash';

test('should retry on error', async () => {
  await new Promise<void>((resolve, reject) => {
    expect.assertions(1);

    let calls = 0;
    const server = nock('http://retry.test')
      .get('/client/features')
      .times(3)
      .reply(() => {
        calls++;
        return [408, ''];
      });

    const unleash = new Unleash({
      appName: 'network',
      url: 'http://retry.test',
      refreshInterval: 1,
      timeout: 0,
      disableMetrics: true,
    });

    unleash.on('error', () => {
      try {
        expect(calls).toBe(3);
        server.done();
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        unleash.destroy();
      }
    });
  });
});
