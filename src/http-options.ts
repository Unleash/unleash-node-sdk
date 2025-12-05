import type { URL } from 'node:url';
import type { Dispatcher } from 'undici';

export interface HttpOptions {
  dispatcher?: (url: URL) => Dispatcher; // this is a breaking change from 'agent'. Ref: https://github.com/Unleash/unleash-node-sdk/pull/332
  rejectUnauthorized?: boolean;
  maxRetries?: number;
}
