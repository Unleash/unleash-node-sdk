// @ts-nocheck
import { EventEmitter } from 'node:events';

export default class FakeRepo extends EventEmitter {
  constructor(data) {
    super();
    this.data = data || {
      name: 'fake-feature',
      enabled: false,
      strategies: [],
    };
  }

  stop() {}

  start() {}

  getToggle() {
    return this.data;
  }
}
