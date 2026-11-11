import { EventEmitter } from 'node:events';
import { type ClientFeatures, getSpecVersion, type UnleashEngine } from '@unleash/yggdrasil-engine';
import { UnleashEvents } from '../events';
import {
  type ApiResponse,
  type ClientFeaturesResponse,
  type EnhancedFeatureInterface,
  type FeatureInterface,
  parseApiResponse,
} from '../feature';
import type { CustomHeaders, CustomHeadersFunction } from '../headers';
import type { HttpOptions } from '../http-options';
import type {
  EnhancedStrategyTransportInterface,
  Segment,
  StrategyTransportInterface,
} from '../strategy/strategy';
import type { TagFilter } from '../tags';
import type { Mode } from '../unleash-config';
import { AdaptiveFetcher } from './adaptive-fetcher';
import type { BootstrapProvider } from './bootstrap-provider';
import type { FetcherInterface } from './fetcher';
import type { StorageProvider } from './storage-provider';

export const SUPPORTED_SPEC_VERSION = getSpecVersion();

export interface RepositoryInterface extends EventEmitter {
  getToggle(name: string): FeatureInterface | undefined;
  getToggles(): FeatureInterface[];
  getTogglesWithSegmentData(): EnhancedFeatureInterface[];
  getSegment(id: number): Segment | undefined;
  stop(): void;
  start(): Promise<void>;
  setMode?(mode: 'polling' | 'streaming'): Promise<void>;
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
  bootstrapOverride?: boolean;
  storageProvider: StorageProvider<ClientFeatures>;
  eventSource?: EventSource;
  mode: Mode;
  fetcher?: FetcherInterface;
  engine: UnleashEngine;
}

export default class Repository extends EventEmitter implements EventEmitter {
  private appName: string;

  private bootstrapProvider: BootstrapProvider;

  private bootstrapOverride: boolean;

  private storageProvider: StorageProvider<ClientFeatures>;

  private ready: boolean = false;

  private connected: boolean = false;

  private stopped: boolean = false;

  private engine: UnleashEngine;

  private fetcher: FetcherInterface;

  private get transport(): AdaptiveFetcher {
    if (!(this.fetcher instanceof AdaptiveFetcher))
      throw new Error('Injected fetcher does not expose transport controls');
    return this.fetcher;
  }

  // Keep references for backward compatibility
  public readonly url: string;

  public readonly projectName?: string;

  // Etag property for backward compatibility
  public get etag(): string | undefined {
    return this.transport.getEtag?.() || undefined;
  }

  public set etag(value: string | undefined) {
    this.transport.setEtag?.(value);
  }

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
    bootstrapOverride = true,
    storageProvider,
    eventSource,
    mode,
    fetcher,
    engine,
  }: RepositoryOptions) {
    super();
    this.appName = appName;
    this.url = url;
    this.projectName = projectName;
    this.bootstrapProvider = bootstrapProvider;
    this.bootstrapOverride = bootstrapOverride;
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
        specVersion: SUPPORTED_SPEC_VERSION,
      });

    this.fetcher.registerUpdate((response) => this.save(parseApiResponse(response), true));
    this.setupFetchingStrategyEvents();
  }

  private setupFetchingStrategyEvents() {
    this.fetcher.on(UnleashEvents.Error, (err) => this.emit(UnleashEvents.Error, err));
    this.fetcher.on(UnleashEvents.Warn, (msg) => this.emit(UnleashEvents.Warn, msg));
    this.fetcher.on(UnleashEvents.Unchanged, () => this.emit(UnleashEvents.Unchanged));
    this.fetcher.on(UnleashEvents.Mode, (data) => this.emit(UnleashEvents.Mode, data));
  }

  validateFeature(feature: FeatureInterface) {
    const errors: string[] = [];
    if (!Array.isArray(feature.strategies)) {
      errors.push(`feature.strategies should be an array, but was ${typeof feature.strategies}`);
    }

    if (feature.variants && !Array.isArray(feature.variants)) {
      errors.push(`feature.variants should be an array, but was ${typeof feature.variants}`);
    }

    if (typeof feature.enabled !== 'boolean') {
      errors.push(`feature.enabled should be an boolean, but was ${typeof feature.enabled}`);
    }

    if (errors.length > 0) {
      const err = new Error(errors.join(', '));
      this.emit(UnleashEvents.Error, err);
    }
  }

  async start(): Promise<void> {
    await Promise.all([this.fetcher.start(), this.loadBackup(), this.loadBootstrap()]);
  }

  async loadBackup(): Promise<void> {
    try {
      const content = await this.storageProvider.get(this.appName);

      if (this.ready) {
        return;
      }

      if (content && this.notEmpty(content)) {
        this.engine.takeState(content);
        this.setReady();
      }
    } catch (err) {
      this.emit(UnleashEvents.Warn, err);
    }
  }

  setReady(): void {
    const doEmitReady = this.ready === false;
    this.ready = true;

    if (doEmitReady) {
      process.nextTick(() => {
        this.emit(UnleashEvents.Ready);
      });
    }
  }

  createSegmentLookup(segments: Segment[] | undefined): Map<number, Segment> {
    if (!segments) {
      return new Map();
    }
    return new Map(segments.map((segment) => [segment.id, segment]));
  }

  public async save(response: ApiResponse, fromApi: boolean): Promise<void> {
    if (this.stopped) {
      return;
    }
    if (fromApi) {
      this.connected = true;
      this.applyFeatureResponse(response);
    } else if (!this.connected) {
      // Only allow bootstrap if not connected
      this.applyFeatureResponse(response);
    }

    this.setReady();
    const newFeatures = this.engine.getState().features;
    this.emit(UnleashEvents.Changed, newFeatures);

    await this.storageProvider.set(this.appName, this.engine.getState());
  }

  private applyFeatureResponse(response: ApiResponse): void {
    // Legacy transport types remain temporarily for the old definition getters.
    this.engine.takeState(response as unknown as ClientFeatures);
  }

  notEmpty(content: ClientFeatures): boolean {
    return content.features.length > 0;
  }

  async loadBootstrap(): Promise<void> {
    try {
      const content = await this.bootstrapProvider.readBootstrap();

      if (!this.bootstrapOverride && this.ready) {
        // early exit if we already have backup data and should not override it.
        return;
      }

      if (content && this.notEmpty(content)) {
        await this.save(parseApiResponse(content), false);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.emit(
        UnleashEvents.Warn,
        `Unleash SDK was unable to load bootstrap.
Message: ${message}`,
      );
    }
  }

  stop() {
    this.stopped = true;
    this.fetcher.stop();
    this.removeAllListeners();
  }

  getSegment(segmentId: number): Segment | undefined {
    return this.engine.getState().segments?.find((segment) => segment.id === segmentId) as
      | Segment
      | undefined;
  }

  getToggle(name: string): FeatureInterface | undefined {
    return this.engine.getState().features.find((feature) => feature.name === name) as unknown as
      | FeatureInterface
      | undefined;
  }

  getToggles(): FeatureInterface[] {
    return this.engine.getState().features as unknown as FeatureInterface[];
  }

  getTogglesWithSegmentData(): EnhancedFeatureInterface[] {
    const toggles = this.getToggles();
    return toggles.map((toggle): EnhancedFeatureInterface => {
      const { strategies, ...restOfToggle } = toggle;

      return { ...restOfToggle, strategies: this.enhanceStrategies(strategies) };
    });
  }

  getMode(): 'streaming' | 'polling' {
    return this.transport.getMode();
  }

  async setMode(mode: 'polling' | 'streaming'): Promise<void> {
    await this.transport.setMode(mode);
  }

  // Compatibility methods for tests - delegate to fetching strategy
  getFailures(): number {
    return this.transport.getFailures();
  }

  nextFetch(): number {
    return this.transport.nextFetch();
  }

  async fetch(): Promise<void> {
    return this.transport.fetch();
  }

  private enhanceStrategies = (
    strategies: StrategyTransportInterface[] | undefined,
  ): EnhancedStrategyTransportInterface[] | undefined => {
    return strategies?.map((strategy) => {
      const { segments, ...restOfStrategy } = strategy;
      const enhancedSegments = segments?.map((segment) => this.getSegment(segment));
      return { ...restOfStrategy, segments: enhancedSegments };
    });
  };
}
