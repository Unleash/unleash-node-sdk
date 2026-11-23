import type { EventEmitter } from 'node:events';
import type { ClientFeatures, ClientFeaturesDelta } from '@unleash/yggdrasil-engine';
import type { CustomHeaders, CustomHeadersFunction } from '../headers';
import type { HttpOptions } from '../http-options';
import type { TagFilter } from '../tags';
import type { Mode } from '../unleash-config';

export type StateUpdate = (state: ClientFeatures | ClientFeaturesDelta) => Promise<void>;

export interface FetcherInterface extends EventEmitter {
  start(): Promise<void>;
  stop(): void;
  /** Store the sink and await it for each snapshot or delta delivered after start. */
  registerUpdate(sink: StateUpdate): void;
}

export interface FetchingOptions extends PollingFetchingOptions, StreamingFetchingOptions {}

export interface CommonFetchingOptions {
  url: string;
  appName: string;
  instanceId: string;
  headers?: CustomHeaders;
  connectionId: string;
  onModeChange?: (mode: Mode['type']) => Promise<void>;
}

export interface PollingFetchingOptions extends CommonFetchingOptions {
  refreshInterval: number;
  tags?: Array<TagFilter>;
  customHeadersFunction?: CustomHeadersFunction;
  mode: Mode;
  namePrefix?: string;
  projectName?: string;
  etag?: string;
  timeout?: number;
  httpOptions?: HttpOptions;
  specVersion: string;
}

export interface StreamingFetchingOptions extends CommonFetchingOptions {
  eventSource?: EventSource;
  maxFailuresUntilFailover?: number;
  failureWindowMs?: number;
}
