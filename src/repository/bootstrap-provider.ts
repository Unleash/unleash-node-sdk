import { promises } from 'node:fs';
import type { ClientFeaturesResponse, FeatureInterface } from '../feature';
import type { CustomHeaders } from '../headers';
import { createHttpClient } from '../request';
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

  constructor(
    options: BootstrapOptions,
    readonly appName: string,
    readonly instanceId: string,
    readonly connectionId: string,
  ) {
    this.url = options.url;
    this.urlHeaders = options.urlHeaders;
    this.filePath = options.filePath;
    this.data = options.data;
    this.segments = options.segments;

    this.appName = appName;
    this.instanceId = instanceId;
  }

  private async loadFromUrl(bootstrapUrl: string): Promise<ClientFeaturesResponse | undefined> {
    const httpClient = await createHttpClient({
      appName: this.appName,
      instanceId: this.instanceId,
      connectionId: this.connectionId,
      timeout: 10_000,
    });
    const response = await httpClient.get({ url: bootstrapUrl, headers: this.urlHeaders });
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
  connectionId: string,
): BootstrapProvider {
  return (
    options.bootstrapProvider ||
    new DefaultBootstrapProvider(options, appName, instanceId, connectionId)
  );
}
