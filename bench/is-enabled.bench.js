const { once } = require('node:events');
const { Bench } = require('tinybench');
const {
  Unleash,
  UnleashEvents,
  initialize,
  isEnabled,
  destroy,
  InMemStorageProvider,
} = require('../lib');

const TOGGLE_NAME = 'bench-toggle';
const CONTEXT = { userId: 'bench-user' };

const bootstrap = {
  data: [
    {
      name: TOGGLE_NAME,
      enabled: true,
      strategies: [
        {
          name: 'default',
          constraints: [
            {
              contextName: 'userId',
              operator: 'REGEX',
              value: '^bench-user$',
            },
          ],
        },
      ],
    },
  ],
};


async function run() {
  const globalInstance = initialize({
    appName: 'bench-app-global',
    url: 'http://127.0.0.1:4242/api/',
    refreshInterval: 0,
    bootstrap,
    storageProvider: new InMemStorageProvider(),
    disableMetrics: true,
  });
  await once(globalInstance, UnleashEvents.Synchronized);

  const bench = new Bench({
    time: 1_000,
    warmupTime: 500,
  });

  bench.add('instance.isEnabled', () => {
    globalInstance.isEnabled(TOGGLE_NAME, CONTEXT);
  });

  await bench.warmup();
  await bench.run();
  console.table(bench.table());

  destroy();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
