const fs = require('node:fs');

const newUnleashVersion = process.argv[2];

const name = 'unleash-node-sdk';

const details = {
  name,
  version: newUnleashVersion,
  sdkVersion: `${name}:${newUnleashVersion}`,
};
fs.writeFileSync('./src/details.json', JSON.stringify(details));
