/* eslint-disable */
const { initialize } = require('../lib');

const client = initialize({
  appName: 'my-application',
  url: 'https://no-where-to-be-found.com/api/',
  refreshInterval: 0,
  disableMetrics: true,
  bootstrap: {
    data: [
      {
        enabled: false,
        name: 'BootstrapDemo',
        description: '',
        project: 'default',
        stale: false,
        type: 'release',
        variants: [],
        strategies: [{ name: 'default' }],
      },
    ],
  },
});

setInterval(() => {
  const enabled = client.isEnabled('BootstrapDemo');
  console.log(`BootstrapDemo: `, `${enabled ? '\x1b[32m' : '\x1b[31m'}`, `${enabled}`, '\x1b[0m');
}, 100);
