import { createServer } from 'node:http';
import { assert, expect, test } from 'vitest';
import { Unleash } from '../unleash';

test('should retry on error', async () => {
  await new Promise<void>((resolve) => {
    expect.assertions(1);

    let calls = 0;
    const server = createServer((_req, res) => {
      calls++;
      res.writeHead(408);
      res.end();
    });

    server.listen(0, '127.0.0.1', () => {
      // @ts-expect-error
      const { port } = server.address();

      const unleash = new Unleash({
        appName: 'network',
        url: `http://localhost:${port}`,
        refreshInterval: 1,
        timeout: 0,
        disableMetrics: true,
      });

      unleash.on('error', () => {
        expect(calls).toBe(3);
        unleash.destroy();
        server.close();
        resolve();
      });
    });
    server.on('error', (e) => {
      if ((e as NodeJS.ErrnoException).code === 'EPERM') {
        server.close();
        resolve();
        return;
      }
      server.close();
      console.error(e);
      assert.fail(e.message);
   });
  });
});
