/* eslint-disable */
const { initialize } = require('../lib');

const _data = [
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
];

const client = initialize({
  appName: 'my-application',
  url: 'https://app.unleash-hosted2.com/demo/api/',
  customHeaders: {
    Authorization: '943ca9171e2c884c545c5d82417a655fb77cec970cc3b78a8ff87f4406b495d0',
  },
  refreshInterval: 2000,
  bootstrap: {
    // data,
    url: 'http://localhost:3000/proxy/client/features',
    urlHeaders: {
      Authorization: 'bootstrap',
    },
  },
});

client.on('error', () => console.log('\x1b[31m', 'Unable to fetch feature toggles', '\x1b[0m'));
client.on('synchronized', () => {
  console.log('synchronized');
});
client.on('ready', () => console.log('ready'));

setInterval(() => {
  const enabled = client.isEnabled('BootstrapDemo');
  console.log(`BootstrapDemo: `, `${enabled ? '\x1b[32m' : '\x1b[31m'}`, `${enabled}`, '\x1b[0m');
}, 100);
