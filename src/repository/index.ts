import { EventEmitter } from 'node:events';
import { UnleashEvents } from '../events';
import type {
  ClientFeaturesDelta,
  ClientFeaturesResponse,
  EnhancedFeatureInterface,
  FeatureInterface,
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
import type { StorageProvider } from './storage-provider';

export const SUPPORTED_SPEC_VERSION = '5.2.0';

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
  storageProvider: StorageProvider<ClientFeaturesResponse>;
  eventSource?: EventSource;
  mode: Mode;
}

interface FeatureToggleData {
  [key: string]: FeatureInterface;
}

export default class Repository extends EventEmitter implements EventEmitter {
  private appName: string;

  private bootstrapProvider: BootstrapProvider;

  private bootstrapOverride: boolean;

  private storageProvider: StorageProvider<ClientFeaturesResponse>;

  private ready: boolean = false;

  private connected: boolean = false;

  private stopped: boolean = false;

  private data: FeatureToggleData = {};

  private segments: Map<number, Segment>;

  private fetcher: AdaptiveFetcher;

  // Keep references for backward compatibility
  public readonly url: string;

  public readonly projectName?: string;

  // Etag property for backward compatibility
  public get etag(): string | undefined {
    return this.fetcher.getEtag?.() || undefined;
  }

  public set etag(value: string | undefined) {
    this.fetcher.setEtag?.(value);
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
  }: RepositoryOptions) {
    super();
    this.appName = appName;
    this.url = url;
    this.projectName = projectName;
    this.bootstrapProvider = bootstrapProvider;
    this.bootstrapOverride = bootstrapOverride;
    this.storageProvider = storageProvider;
    this.segments = new Map();

    this.fetcher = new AdaptiveFetcher({
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
      onSave: this.save.bind(this),
      onSaveDelta: this.saveDelta.bind(this),
    });

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
        this.data = this.convertToMap(content.features);
        this.segments = this.createSegmentLookup(content.segments);
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

  public async save(response: ClientFeaturesResponse, fromApi: boolean): Promise<void> {
    if (this.stopped) {
      return;
    }
    if (fromApi) {
      this.connected = true;
      this.data = this.convertToMap(response.features);
      this.segments = this.createSegmentLookup(response.segments);
    } else if (!this.connected) {
      // Only allow bootstrap if not connected
      this.data = this.convertToMap(response.features);
      this.segments = this.createSegmentLookup(response.segments);
    }

    this.setReady();
    this.emit(UnleashEvents.Changed, [...response.features]);
    await this.storageProvider.set(this.appName, response);
  }

  public async saveDelta(delta: ClientFeaturesDelta): Promise<void> {
    if (this.stopped) {
      return;
    }
    this.connected = true;
    delta.events.forEach((event) => {
      if (event.type === 'feature-updated') {
        this.data[event.feature.name] = event.feature;
      } else if (event.type === 'feature-removed') {
        delete this.data[event.featureName];
      } else if (event.type === 'segment-updated') {
        this.segments.set(event.segment.id, event.segment);
      } else if (event.type === 'segment-removed') {
        this.segments.delete(event.segmentId);
      } else if (event.type === 'hydration') {
        this.data = this.convertToMap(event.features);
        this.segments = this.createSegmentLookup(event.segments);
      }
    });

    this.setReady();
    this.emit(UnleashEvents.Changed, Object.values(this.data));
    await this.storageProvider.set(this.appName, {
      features: Object.values(this.data),
      segments: [...this.segments.values()],
      version: 0,
    });
  }

  notEmpty(content: ClientFeaturesResponse): boolean {
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
        await this.save(content, false);
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

  private convertToMap(features: FeatureInterface[]): FeatureToggleData {
    const obj = features.reduce(
      (o: { [s: string]: FeatureInterface }, feature: FeatureInterface) => {
        this.validateFeature(feature);
        o[feature.name] = feature;
        return o;
      },
      {} as { [s: string]: FeatureInterface },
    );

    return obj;
  }

  stop() {
    this.stopped = true;
    this.fetcher.stop();
    this.removeAllListeners();
  }

  getSegment(segmentId: number): Segment | undefined {
    return this.segments.get(segmentId);
  }

  getToggle(name: string): FeatureInterface | undefined {
    return this.data[name];
  }

  getToggles(): FeatureInterface[] {
    return Object.keys(this.data).map((key) => this.data[key]);
  }

  getTogglesWithSegmentData(): EnhancedFeatureInterface[] {
    const toggles = this.getToggles();
    return toggles.map((toggle): EnhancedFeatureInterface => {
      const { strategies, ...restOfToggle } = toggle;

      return { ...restOfToggle, strategies: this.enhanceStrategies(strategies) };
    });
  }

  getMode(): 'streaming' | 'polling' {
    return this.fetcher.getMode();
  }

  async setMode(mode: 'polling' | 'streaming'): Promise<void> {
    await this.fetcher.setMode(mode);
  }

  // Compatibility methods for tests - delegate to fetching strategy
  getFailures(): number {
    return this.fetcher.getFailures();
  }

  nextFetch(): number {
    return this.fetcher.nextFetch();
  }

  async fetch(): Promise<void> {
    return this.fetcher.fetch();
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
