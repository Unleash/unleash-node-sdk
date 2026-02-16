const { initialize, isEnabled } = require('../lib');

const url = 'http://localhost:4242/api/';
const apiToken = '*:development.54dfdf58f08d0dc76ce3a68c4e6d90c6c3bdbe56d379de0bada35805';
const toggleName = 'demo001';
const unleashContext = { userId: '1232' };

const unleash = initialize({
  appName: 'my-application',
  url,
  refreshInterval: 1000,
  tags: [{name: 'simple', value: 'true'}],
  projectName: 'default',
  namePrefix: 'my-',
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
