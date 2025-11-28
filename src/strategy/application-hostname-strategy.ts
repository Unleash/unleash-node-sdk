import { hostname } from 'node:os';
import { Strategy } from './strategy';

export default class ApplicationHostnameStrategy extends Strategy {
  private hostname: string;

  constructor() {
    super('applicationHostname');
    this.hostname = (process.env.HOSTNAME || hostname() || 'undefined').toLowerCase();
  }

  isEnabled(parameters: { hostNames?: string }) {
    if (!parameters.hostNames) {
      return false;
    }

    return parameters.hostNames
      .toLowerCase()
      .split(/\s*,\s*/)
      .includes(this.hostname);
  }
}
