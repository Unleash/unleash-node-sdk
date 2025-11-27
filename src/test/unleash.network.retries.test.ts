import { test } from 'vitest';
import { createServer } from 'http';
import { Unleash } from '../unleash';

test('should retry on error', (t) =>
  new Promise((resolve) => {
    let calls = 0;
    const server = createServer((req, res) => {
      calls++;
      res.writeHead(408);
      res.end();
    });

    server.listen(() => {
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
        t.is(calls, 3);
        unleash.destroy();
        server.close();
        resolve(1);
      });
    });
    server.on('error', (e) => {
      console.error(e);
      t.fail(e.message);
      server.close();
    });
  }));
