import type { Agent } from 'node:http';
import type { URL } from 'node:url';

export interface HttpOptions {
  agent?: (url: URL) => Agent;
  rejectUnauthorized?: boolean;
}
