const { initialize, isEnabled } = require('../lib');

const url = 'http://localhost:4242/api/';
const apiToken = '*:development.8400d1451101f5d05c0817c03ae5286371369311121bb114f4e268f3';
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
