const { Unleash } = require('../lib');

const UNLEASH_URL = process.env.UNLEASH_URL;
const UNLEASH_API_KEY = process.env.UNLEASH_API_KEY;
const UNLEASH_TOGGLE_NAME = process.env.UNLEASH_TOGGLE_NAME || 'my-toggle';
const INSTANCE_ID = process.env.UNLEASH_INSTANCE_ID || `node-streaming-${process.pid}`;
const CLIENT_ID = process.env.UNLEASH_CLIENT_ID || 'node-streaming-beta';

const client = new Unleash({
  appName: 'my-node-service',
  url: UNLEASH_URL,
  instanceId: INSTANCE_ID,
  customHeaders: {
    Authorization: UNLEASH_API_KEY,
  },
  experimentalMode: { type: 'streaming' },
  skipInstanceCountWarning: true,
});

client.on('changed', () => {
  console.log(client.isEnabled(UNLEASH_TOGGLE_NAME, { userId: CLIENT_ID, clientId: CLIENT_ID }));
});
