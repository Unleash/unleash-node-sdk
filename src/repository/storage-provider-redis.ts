import { safeName } from '../helpers';
import { StorageProvider } from './storage-provider';

type RedisClient = {
  isOpen: boolean;
  connect(): Promise<void>;
  set(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  quit(): Promise<void>;
};

type RedisModule = {
  createClient(options?: Record<string, unknown>): RedisClient;
};

function loadRedisModule(): RedisModule {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require('redis');
  } catch (error: any) {
    const message =
      'RedisStorageProvider requires the "redis" package. Install it with ' +
      '`npm install redis` or `yarn add redis`.';
    if (error instanceof Error) {
      error.message = `${message} Original error: ${error.message}`;
    }
    throw error;
  }
}

export interface RedisStorageProviderOptions {
  client?: RedisClient;
  url?: string;
  clientOptions?: Record<string, unknown>;
  keyPrefix?: string;
}

export default class RedisStorageProvider<T> implements StorageProvider<T> {
  private readonly client: RedisClient;

  private readonly ownsClient: boolean;

  private readonly keyPrefix: string;

  private connectPromise?: Promise<void>;

  constructor(options: RedisStorageProviderOptions = {}) {
    const { client, url, clientOptions, keyPrefix = 'unleash:backup:' } = options;

    if (client) {
      this.client = client;
      this.ownsClient = false;
    } else {
      const redisOptions: Record<string, unknown> = { ...(clientOptions ?? {}) };
      if (url) {
        redisOptions.url = url;
      }
      const redis = loadRedisModule();
      this.client = redis.createClient(redisOptions);
      this.ownsClient = true;
    }

    this.keyPrefix = keyPrefix.endsWith(':') ? keyPrefix : `${keyPrefix}:`;
  }

  private storageKey(key: string): string {
    return `${this.keyPrefix}${safeName(key)}`;
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.isOpen) {
      return;
    }

    if (!this.connectPromise) {
      this.connectPromise = this.client.connect().finally(() => {
        this.connectPromise = undefined;
      });
    }

    await this.connectPromise;
  }

  async set(key: string, data: T): Promise<void> {
    await this.ensureConnected();
    await this.client.set(this.storageKey(key), JSON.stringify(data));
  }

  async get(key: string): Promise<T | undefined> {
    await this.ensureConnected();
    const raw = await this.client.get(this.storageKey(key));

    if (!raw || raw.trim().length === 0) {
      return undefined;
    }

    try {
      return JSON.parse(raw);
    } catch (error: any) {
      if (error instanceof Error) {
        error.message = `Unleash storage failed parsing redis value for ${this.storageKey(
          key,
        )}: ${error.message}`;
      }
      throw error;
    }
  }

  async destroy(): Promise<void> {
    if (!this.ownsClient) {
      return;
    }

    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}
