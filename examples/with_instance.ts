import * as express from 'express';
import { Strategy, Unleash } from '../lib/unleash';

const fixture = require('./fixtures/format-0.json');

const app = express();
app.get('/', (_req, res) => res.json(fixture));
app.listen(1234);

const strategies: Strategy[] = [
  new Strategy('default', true),
  new Strategy('ActiveForUserWithEmail', true),
  new Strategy('default'),
];

const client = new Unleash({
  appName: 'super-app',
  backupPath: __dirname,
  url: 'http://localhost:1234',
  strategies,
});

client.on('error', console.error);
client.on('warn', console.log);

client.on('ready', () => {
  setTimeout(() => {
    console.log('featureX', client.isEnabled('featureX', {}));
    console.log('featureY', client.isEnabled('featureY', {}));
  }, 100);
});

console.log('featureX', client.isEnabled('featureX', {}));

setInterval(() => {
  console.log('featureX', client.isEnabled('featureX', {}));
  console.log('featureY', client.isEnabled('featureY', {}));
}, 5000);
