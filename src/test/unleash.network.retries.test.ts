import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from 'vitest';
import { defaultRetry } from '../request';
import { Unleash } from '../unleash';

test('should retry on error', async () => {
  await new Promise<void>((resolve, reject) => {
    expect.assertions(1);

    const expectedCalls = (defaultRetry.limit ?? 0) + 1;
    let calls = 0;
    let finished = false;
    const server = createServer((_req, res) => {
      calls++;
      res.writeHead(408);
      res.end();
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;

      const unleash = new Unleash({
        appName: 'network',
        url: `http://localhost:${port}`,
        refreshInterval: 1,
        timeout: 0,
        disableMetrics: true,
      });

      unleash.on('error', () => {
        if (finished || calls < expectedCalls) return;
        finished = true;
        expect(calls).toBeGreaterThanOrEqual(expectedCalls);
        unleash.destroy();
        server.close();
        resolve();
      });
    });
    server.on('error', (e) => {
      console.error(e);
      server.close();
      if (!finished) {
        finished = true;
        reject(e);
      }
    });
  });
});
