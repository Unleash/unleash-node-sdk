import type { EventEmitter } from 'node:events';
import type { ClientFeaturesDelta, ClientFeaturesResponse } from '../feature';
import type { CustomHeaders, CustomHeadersFunction } from '../headers';
import type { HttpOptions } from '../http-options';
import type { TagFilter } from '../tags';
import type { Mode } from '../unleash-config';

export interface FetcherInterface extends EventEmitter {
  start(): Promise<void>;
  stop(): void;
}

export interface FetchingOptions extends PollingFetchingOptions, StreamingFetchingOptions {}

export interface CommonFetchingOptions {
  url: string;
  appName: string;
  instanceId: string;
  headers?: CustomHeaders;
  connectionId: string;
  onSave: (response: ClientFeaturesResponse, fromApi: boolean) => Promise<void>;
  onSaveDelta: (delta: ClientFeaturesDelta) => Promise<void>;
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
}

export interface StreamingFetchingOptions extends CommonFetchingOptions {
  eventSource?: EventSource;
  maxFailuresUntilFailover?: number;
  failureWindowMs?: number;
}
