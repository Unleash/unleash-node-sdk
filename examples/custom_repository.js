const { EventEmitter } = require('node:events');
const { initialize, isEnabled, UnleashEvents } = require('../lib');

class MyRepo extends EventEmitter {
  constructor() {
    super();
    this.data = {
      name: 'THE-feature',
      description: 'foo',
      enabled: true,
      strategies: [{ name: 'default' }],
      variants: [],
    };
  }

  start() {}

  stop() {}

  getToggle() {
    return this.data;
  }
}
const repo = new MyRepo();

const client = initialize({
  appName: 'my-application',
  url: 'not-needed',
  disableMetrics: true,
  repository: repo,
});

repo.emit(UnleashEvents.Ready);

client.on('error', console.error);
client.on('warn', console.log);

console.log(`feature enabled: ${isEnabled('THE-feature')}`);
