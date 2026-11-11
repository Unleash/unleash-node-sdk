import { EventEmitter } from 'node:events';
import {
  type ClientFeatures,
  type ClientFeaturesDelta,
  getSpecVersion,
  type ToggleDefinition,
  type UnleashEngine,
} from '@unleash/yggdrasil-engine';
import { UnleashEvents } from '../events';
import type { CustomHeaders, CustomHeadersFunction } from '../headers';
import type { HttpOptions } from '../http-options';
import type { TagFilter } from '../tags';
import type { Mode } from '../unleash-config';
import { AdaptiveFetcher } from './adaptive-fetcher';
import type { BootstrapProvider } from './bootstrap-provider';
import type { FetcherInterface } from './fetcher';
import type { StorageProvider } from './storage-provider';

export interface RepositoryInterface extends EventEmitter {
  stop(): void;
  start(): Promise<void>;
}

export interface RepositoryOptions {
  url: string;
  appName: string;
  instanceId: string;
  connectionId: string;
  projectName?: string;
  refreshInterval: number;
  timeout?: number;
  headers?: CustomHeaders;
  customHeadersFunction?: CustomHeadersFunction;
  httpOptions?: HttpOptions;
  namePrefix?: string;
  tags?: Array<TagFilter>;
  bootstrapProvider: BootstrapProvider;
  storageProvider: StorageProvider<ClientFeatures>;
  eventSource?: EventSource;
  mode: Mode;
  engine: UnleashEngine;
  fetcher?: FetcherInterface;
}

enum State {
  Uninitialized,
  RestoredFromBackup,
  Bootstrapped,
  Hydrated,
  Closed,
}

class Lifecycle extends EventEmitter {
  private current = State.Uninitialized;

  get state(): State {
    return this.current;
  }

  moveTo(requested: State): State {
    const previous = this.current;

    if (requested <= previous) {
      return this.current;
    }

    this.current = requested;

    if (previous === State.Uninitialized && requested !== State.Closed) {
      process.nextTick(() => {
        this.emit(UnleashEvents.Ready);
      });
    }

    if (requested === State.Hydrated) {
      this.emit(UnleashEvents.Synchronized);
    }

    return this.current;
  }
}

export default class Repository extends EventEmitter implements EventEmitter {
  private appName: string;

  private bootstrapProvider: BootstrapProvider;

  private storageProvider: StorageProvider<ClientFeatures>;

  private fetcher: FetcherInterface;

  private engine: UnleashEngine;

  private readonly lifeCycle = new Lifecycle();

  constructor({
    url,
    appName,
    instanceId,
    connectionId,
    projectName,
    refreshInterval = 15_000,
    timeout,
    headers,
    customHeadersFunction,
    httpOptions,
    namePrefix,
    tags,
    bootstrapProvider,
    storageProvider,
    eventSource,
    mode,
    engine,
    fetcher,
  }: RepositoryOptions) {
    super();
    this.appName = appName;
    this.bootstrapProvider = bootstrapProvider;
    this.storageProvider = storageProvider;
    this.engine = engine;

    this.fetcher =
      fetcher ??
      new AdaptiveFetcher({
        url,
        appName,
        instanceId,
        connectionId,
        refreshInterval,
        timeout,
        headers,
        customHeadersFunction,
        httpOptions,
        namePrefix,
        tags,
        projectName,
        mode,
        eventSource,
        specVersion: getSpecVersion(),
      });

    this.fetcher.registerUpdate(this.onUpdate.bind(this));

    this.setupEventForwarding();
  }

  private async onUpdate(newFeatures: ClientFeatures | ClientFeaturesDelta): Promise<void> {
    if (this.isClosed()) return;

    try {
      this.takeState(newFeatures);
      if (this.isClosed()) return;
      this.lifeCycle.moveTo(State.Hydrated);
      if (this.isClosed()) return;

      const newState = this.engine.getState();

      const featureArray: Array<ToggleDefinition> = newState.features.map((f) => {
        return {
          name: f.name,
          type: f.type,
          project: f.project || 'default',
          enabled: f.enabled,
        };
      });

      this.emit(UnleashEvents.Changed, featureArray);

      if (this.isClosed()) return;
      await this.storageProvider.set(this.appName, newState);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.emit(
        UnleashEvents.Warn,
        `Unleash SDK was unable to update from fetcher.\nMessage: ${message}`,
      );
    }
  }

  private isClosed(): boolean {
    return this.lifeCycle.state === State.Closed;
  }

  private takeState(state: ClientFeatures | ClientFeaturesDelta): void {
    const warnings = this.engine.takeState(state);
    if (warnings) this.emit(UnleashEvents.Warn, warnings);
  }

  private setupEventForwarding() {
    this.fetcher.on(UnleashEvents.Error, (err) => this.emit(UnleashEvents.Error, err));
    this.fetcher.on(UnleashEvents.Warn, (msg) => this.emit(UnleashEvents.Warn, msg));
    this.fetcher.on(UnleashEvents.Unchanged, () => this.emit(UnleashEvents.Unchanged));
    this.fetcher.on(UnleashEvents.Mode, (data) => this.emit(UnleashEvents.Mode, data));

    this.lifeCycle.on(UnleashEvents.Ready, () => this.emit(UnleashEvents.Ready));
    this.lifeCycle.on(UnleashEvents.Synchronized, () => this.emit(UnleashEvents.Synchronized));
  }

  async loadBackup(): Promise<void> {
    try {
      const content = await this.storageProvider.get(this.appName);

      if (this.lifeCycle.state >= State.RestoredFromBackup) {
        return;
      }

      if (content && this.notEmpty(content)) {
        this.takeState(content);
        if (this.lifeCycle.state === State.Closed) return;
        this.lifeCycle.moveTo(State.RestoredFromBackup);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.emit(UnleashEvents.Warn, `Unleash SDK was unable to load backup.\nMessage: ${message}`);
    }
  }

  async loadBootstrap(): Promise<void> {
    try {
      const content = await this.bootstrapProvider.readBootstrap();

      if (this.lifeCycle.state >= State.Bootstrapped) {
        return;
      }

      if (content && this.notEmpty(content)) {
        this.takeState(content);
        if (this.lifeCycle.state === State.Closed) return;
        this.lifeCycle.moveTo(State.Bootstrapped);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.emit(
        UnleashEvents.Warn,
        `Unleash SDK was unable to load bootstrap.\nMessage: ${message}`,
      );
    }
  }

  notEmpty(content: ClientFeatures): boolean {
    return content.features.length > 0;
  }

  async start(): Promise<void> {
    await Promise.all([this.fetcher.start(), this.loadBackup(), this.loadBootstrap()]);
  }

  stop() {
    this.lifeCycle.moveTo(State.Closed);
    this.fetcher.stop();
    this.removeAllListeners();
  }
}
