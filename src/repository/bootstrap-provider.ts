import { promises } from 'node:fs';
import type { ClientFeatures } from '@unleash/yggdrasil-engine';
import fetch from 'make-fetch-happen';
import type { CustomHeaders } from '../headers';
import { buildHeaders } from '../request';

export interface BootstrapProvider {
  readBootstrap(): Promise<ClientFeatures | undefined>;
}

export interface BootstrapOptions {
  url?: string;
  urlHeaders?: CustomHeaders;
  filePath?: string;
  features?: ClientFeatures;
  bootstrapProvider?: BootstrapProvider;
}

export class DefaultBootstrapProvider implements BootstrapProvider {
  private url?: string;

  private urlHeaders?: CustomHeaders;

  private filePath?: string;

  private data?: ClientFeatures;

  private appName: string;

  private instanceId: string;

  constructor(options: BootstrapOptions, appName: string, instanceId: string) {
    this.url = options.url;
    this.urlHeaders = options.urlHeaders;
    this.filePath = options.filePath;
    this.data = options.features;

    this.appName = appName;
    this.instanceId = instanceId;
  }

  private async loadFromUrl(bootstrapUrl: string): Promise<ClientFeatures | undefined> {
    const response = await fetch(bootstrapUrl, {
      method: 'GET',
      timeout: 10_000,
      headers: buildHeaders({
        appName: this.appName,
        instanceId: this.instanceId,
        etag: undefined,
        contentType: undefined,
        custom: this.urlHeaders,
      }),
      retry: {
        retries: 2,
        maxTimeout: 10_000,
      },
    });
    if (response.ok) {
      return response.json();
    }
    return undefined;
  }

  private async loadFromFile(filePath: string): Promise<ClientFeatures | undefined> {
    const fileContent = await promises.readFile(filePath, 'utf8');
    return JSON.parse(fileContent);
  }

  async readBootstrap(): Promise<ClientFeatures | undefined> {
    if (this.data) {
      return this.data;
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
