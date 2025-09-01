import { EventEmitter } from 'events';
import { ClientFeaturesDelta, ClientFeaturesResponse } from '../feature';
import { Mode } from '../unleash-config';

export interface FetcherInterface extends EventEmitter {
  start(): Promise<void>;
  stop(): void;
}

export interface FetchingOptions extends PollingFetchingOptions, StreamingFetchingOptions {}

export interface CommonFetchingOptions {
  url: string;
  appName: string;
  instanceId: string;
  headers?: any;
  connectionId: string;
  onSave: (response: ClientFeaturesResponse, fromApi: boolean) => Promise<void>;
  onSaveDelta: (delta: ClientFeaturesDelta) => Promise<void>;
  onModeChange?: (mode: 'polling' | 'streaming') => Promise<void>;
}

export interface PollingFetchingOptions extends CommonFetchingOptions {
  refreshInterval: number;
  tags?: any[];
  customHeadersFunction?: any;
  mode: Mode;
  namePrefix?: string;
  projectName?: string;
  etag?: string;
  timeout?: number;
  httpOptions?: any;
}

export interface StreamingFetchingOptions extends CommonFetchingOptions {
  eventSource?: EventSource;
}
