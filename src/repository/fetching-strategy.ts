import { EventEmitter } from 'events';
import { ClientFeaturesDelta, ClientFeaturesResponse } from '../feature';
import { Mode } from '../unleash-config';

export interface FetchingStrategyInterface extends EventEmitter {
  start(): Promise<void>;
  stop(): void;
  setMode?(mode: 'polling' | 'streaming'): Promise<void>;
  getEtag?(): string | undefined;
  setEtag?(value: string | undefined): void;
}

export interface FetchingStrategyOptions {
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
