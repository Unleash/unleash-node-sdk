const { initialize, isEnabled } = require('../lib');

const url = 'https://app.unleash-hosted.com/demo/api/';
const apiToken = '943ca9171e2c884c545c5d82417a655fb77cec970cc3b78a8ff87f4406b495d0';
const toggleName = 'demo001';
const unleashContext = { userId: '1232' };

const unleash = initialize({
  appName: 'my-application',
  url,
  refreshInterval: 1000,
  customHeaders: {
    Authorization: apiToken,
  },
});

unleash.on('error', console.error);
unleash.on('warn', console.log);
unleash.on('ready', () => {
  console.log('ready!');
});

console.log(`Fetching toggles from: ${url}`);

setInterval(() => {
  const enabled = isEnabled(toggleName, unleashContext);
  console.log(`Enabled: ${enabled}`);
}, 1000);
