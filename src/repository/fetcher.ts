import type { EventEmitter } from 'node:events';
import type { ApiResponse } from '../feature';
import type { CustomHeadersFunction } from '../headers';
import type { GetRequestOptions, SDKData } from '../request';
import type { TagFilter } from '../tags';
import type { Mode } from '../unleash-config';

export interface FetcherInterface extends EventEmitter {
  start(): Promise<void>;
  stop(): void;
}

export interface FetchingOptions extends PollingFetchingOptions, StreamingFetchingOptions {}

export interface CommonFetchingOptions extends GetRequestOptions, SDKData {
  onSave: (response: ApiResponse, fromApi: boolean) => Promise<void>;
  onModeChange?: (mode: Mode['type']) => Promise<void>;
}

export interface PollingFetchingOptions extends CommonFetchingOptions {
  refreshInterval: number;
  tags?: Array<TagFilter>;
  customHeadersFunction?: CustomHeadersFunction;
  mode: Mode;
  namePrefix?: string;
  projectName?: string;
}

export interface StreamingFetchingOptions extends CommonFetchingOptions {
  eventSource?: EventSource;
  maxFailuresUntilFailover?: number;
  failureWindowMs?: number;
}
