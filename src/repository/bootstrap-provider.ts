import { promises } from 'node:fs';
import type { ClientFeaturesResponse, FeatureInterface } from '../feature';
import type { CustomHeaders } from '../headers';
import { getKyClient } from '../http-client';
import { buildHeaders, getDefaultAgent } from '../request';
import type { Segment } from '../strategy/strategy';

export interface BootstrapProvider {
  readBootstrap(): Promise<ClientFeaturesResponse | undefined>;
}

export interface BootstrapOptions {
  url?: string;
  urlHeaders?: CustomHeaders;
  filePath?: string;
  data?: FeatureInterface[];
  segments?: Segment[];
  bootstrapProvider?: BootstrapProvider;
}

export class DefaultBootstrapProvider implements BootstrapProvider {
  private url?: string;

  private urlHeaders?: CustomHeaders;

  private filePath?: string;

  private data?: FeatureInterface[];

  private segments?: Segment[];

  private appName: string;

  private instanceId: string;

  constructor(options: BootstrapOptions, appName: string, instanceId: string) {
    this.url = options.url;
    this.urlHeaders = options.urlHeaders;
    this.filePath = options.filePath;
    this.data = options.data;
    this.segments = options.segments;

    this.appName = appName;
    this.instanceId = instanceId;
  }

  private async loadFromUrl(bootstrapUrl: string): Promise<ClientFeaturesResponse | undefined> {
    const ky = await getKyClient();
    const requestOptions = {
      timeout: 10_000,
      headers: buildHeaders({
        appName: this.appName,
        instanceId: this.instanceId,
        etag: undefined,
        contentType: undefined,
        custom: this.urlHeaders,
      }),
      agent: getDefaultAgent,
    } as const;
    const response = await ky.get(bootstrapUrl, requestOptions).catch((err: unknown) => {
      if (err && typeof err === 'object' && 'response' in err) {
        const resp = (err as { response?: Response }).response;
        if (resp) {
          return resp;
        }
      }
      throw err;
    });
    if (response.ok) {
      return response.json();
    }
    return undefined;
  }

  private async loadFromFile(filePath: string): Promise<ClientFeaturesResponse | undefined> {
    const fileContent = await promises.readFile(filePath, 'utf8');
    return JSON.parse(fileContent);
  }

  async readBootstrap(): Promise<ClientFeaturesResponse | undefined> {
    if (this.data) {
      return { version: 2, segments: this.segments, features: [...this.data] };
    }
    if (this.url) {
      return this.loadFromUrl(this.url);
    }
    if (this.filePath) {
      return this.loadFromFile(this.filePath);
    }

    return undefined;
  }
}

export function resolveBootstrapProvider(
  options: BootstrapOptions,
  appName: string,
  instanceId: string,
): BootstrapProvider {
  return options.bootstrapProvider || new DefaultBootstrapProvider(options, appName, instanceId);
}
