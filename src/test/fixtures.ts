import { EventEmitter } from 'node:events';
import { afterEach } from 'vitest';
import type { ClientFeaturesResponse as ClientFeatures, ClientFeaturesDelta } from '../feature';
import type { FetcherInterface, StateUpdate } from '../repository/fetcher';
import InMemStorageProvider from '../repository/storage-provider-in-mem';
import { Unleash } from '../unleash';
import type { UnleashConfig } from '../unleash-config';

export type Feature = ClientFeatures['features'][number];

export function feature(name = 'feature', overrides: Partial<Feature> = {}): Feature {
  return {
    name,
    enabled: true,
    strategies: [{ name: 'default', parameters: {}, constraints: [], variants: undefined }],
    ...overrides,
  };
}

export function state(features: Feature[] = [feature()]): ClientFeatures {
  return { version: 2, query: undefined, features };
}

export class FakeFetcher extends EventEmitter implements FetcherInterface {
  starts = 0;
  stops = 0;
  private sink?: StateUpdate;

  constructor(private initial?: ClientFeatures | ClientFeaturesDelta) {
    super();
  }

  registerUpdate(sink: StateUpdate): void {
    this.sink = sink;
  }

  async start(): Promise<void> {
    this.starts++;
    if (this.initial) await this.publish(this.initial);
  }

  stop(): void {
    this.stops++;
  }

  async publish(update: ClientFeatures | ClientFeaturesDelta): Promise<void> {
    if (!this.sink) throw new Error('Fetcher has not been registered');
    await this.sink(update);
  }
}

export class TestEventSource {
  closed = false;
  private events = new EventEmitter();

  addEventListener(event: string, listener: (...args: unknown[]) => unknown): void {
    this.events.on(event, listener);
  }

  close(): void {
    this.closed = true;
    this.events.removeAllListeners();
  }

  async send(event: string, data: unknown): Promise<void> {
    const payload =
      event === 'error' ? data : { data: typeof data === 'string' ? data : JSON.stringify(data) };
    await Promise.all(this.events.listeners(event).map((listener) => listener(payload)));
  }
}

const clients: Unleash[] = [];

export function client(options: Partial<UnleashConfig> = {}): Unleash {
  const instance = new Unleash({
    appName: 'sdk-test',
    url: 'http://unleash.test/api/',
    disableAutoStart: true,
    disableMetrics: true,
    skipInstanceCountWarning: true,
    storageProvider: new InMemStorageProvider<ClientFeatures>(),
    fetcher: new FakeFetcher(),
    ...options,
  });
  clients.push(instance);
  return instance;
}

afterEach(() => {
  for (const instance of clients.splice(0)) instance.destroy();
});
