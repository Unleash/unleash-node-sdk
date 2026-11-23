import type { ClientFeatures } from '@unleash/yggdrasil-engine';
import type { CustomHeaders, CustomHeadersFunction } from './headers';
import type { HttpOptions } from './http-options';
import type { BootstrapOptions } from './repository/bootstrap-provider';
import type { FetcherInterface } from './repository/fetcher';
import type { StorageProvider } from './repository/storage-provider';
import type { Strategy } from './strategy';
import type { TagFilter } from './tags';

export type Mode = { type: 'polling'; format: 'delta' | 'full' } | { type: 'streaming' };

export interface UnleashConfig {
  appName: string;
  environment?: string;
  instanceId?: string;
  url: string;
  refreshInterval?: number;
  projectName?: string;
  metricsInterval?: number;
  metricsJitter?: number;
  namePrefix?: string;
  disableMetrics?: boolean;
  backupPath?: string;
  strategies?: Strategy[];
  customHeaders?: CustomHeaders;
  customHeadersFunction?: CustomHeadersFunction;
  timeout?: number;
  fetcher?: FetcherInterface;
  httpOptions?: HttpOptions;
  tags?: Array<TagFilter>;
  bootstrap?: BootstrapOptions;
  bootstrapOverride?: boolean;
  storageProvider?: StorageProvider<ClientFeatures>;
  disableAutoStart?: boolean;
  skipInstanceCountWarning?: boolean;
  experimentalMode?: Mode;
  sdkFlavor?: string;
  sdkFlavorVersion?: string;
}
