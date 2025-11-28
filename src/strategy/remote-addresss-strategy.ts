import { Address4 } from 'ip-address';
import type { Context } from '../context';
import { Strategy } from './strategy';

export default class RemoteAddressStrategy extends Strategy {
  constructor() {
    super('remoteAddress');
  }

  isEnabled(parameters: { IPs?: string }, context: Context) {
    if (!parameters.IPs) {
      return false;
    }
    return parameters.IPs.split(/\s*,\s*/).some((range: string): boolean => {
      if (range === context.remoteAddress) {
        return true;
      }
      try {
        const subnetRange = new Address4(range);
        const remoteAddress = new Address4(context.remoteAddress || '');
        return remoteAddress.isInSubnet(subnetRange);
      } catch (_err) {
        return false;
      }
    });
  }
}
