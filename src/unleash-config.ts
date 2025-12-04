import type { ClientFeaturesResponse } from './feature';
import type { CustomHeaders, CustomHeadersFunction } from './headers';
import type { HttpOptions } from './http-options';
import type { RepositoryInterface } from './repository';
import type { BootstrapOptions } from './repository/bootstrap-provider';
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
  repository?: RepositoryInterface;
  httpOptions?: HttpOptions;
  tags?: Array<TagFilter>;
  bootstrap?: BootstrapOptions;
  bootstrapOverride?: boolean;
  storageProvider?: StorageProvider<ClientFeaturesResponse>;
  disableAutoStart?: boolean;
  skipInstanceCountWarning?: boolean;
  experimentalMode?: Mode;
}
