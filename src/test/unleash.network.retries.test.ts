import test from 'ava';
import { createServer } from 'http';
import { Unleash } from '../unleash';

test('should retry on error', (t) =>
  new Promise((resolve) => {
    t.plan(1);

    let calls = 0;
    const server = createServer((req, res) => {
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
        t.is(calls, 3);
        unleash.destroy();
        server.close();
        resolve();
      });
    });
    server.on('error', (e) => {
      if ((e as NodeJS.ErrnoException).code === 'EPERM') {
        t.pass();
        server.close();
        resolve();
        return;
      }
      server.close();
      console.error(e);
      t.fail(e.message);
    });
  }));
