import { EventEmitter } from 'events';
import { ClientFeaturesDelta, ClientFeaturesResponse } from '../feature';
import { Mode } from '../unleash-config';

export interface FetcherInterface extends EventEmitter {
  start(): Promise<void>;
  stop(): void;
}

export interface FetchingOptions {
  url: string;
  appName: string;
  instanceId: string;
  connectionId: string;
  refreshInterval: number;
  timeout?: number;
  headers?: any;
  customHeadersFunction?: any;
  httpOptions?: any;
  namePrefix?: string;
  tags?: any[];
  projectName?: string;
  mode: Mode;
  etag?: string;
  eventSource?: EventSource;
  onSave: (response: ClientFeaturesResponse, fromApi: boolean) => Promise<void>;
  onSaveDelta: (delta: ClientFeaturesDelta) => Promise<void>;
  onModeChange?: (mode: 'polling' | 'streaming') => Promise<void>;
}
