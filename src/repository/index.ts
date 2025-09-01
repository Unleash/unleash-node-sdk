import { EventEmitter } from 'events';
import {
  ClientFeaturesDelta,
  ClientFeaturesResponse,
  EnhancedFeatureInterface,
  FeatureInterface,
  parseClientFeaturesDelta,
} from '../feature';
import { get, buildHeaders } from '../request';
import { CustomHeaders, CustomHeadersFunction } from '../headers';
import getUrl, { resolveUrl } from '../url-utils';
import { HttpOptions } from '../http-options';
import { TagFilter } from '../tags';
import { BootstrapProvider } from './bootstrap-provider';
import { StorageProvider } from './storage-provider';
import { UnleashEvents } from '../events';
import {
  EnhancedStrategyTransportInterface,
  Segment,
  StrategyTransportInterface,
} from '../strategy/strategy';
import { EventSource } from '../event-source';
import { Mode } from '../unleash-config';

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
  private timer: NodeJS.Timeout | undefined;

  private url: string;

  private etag: string | undefined;

  private appName: string;

  private instanceId: string;

  private connectionId: string;

  private refreshInterval: number;

  private headers?: CustomHeaders;

  private failures: number = 0;

  private customHeadersFunction?: CustomHeadersFunction;

  private timeout?: number;

  private stopped = false;

  private projectName?: string;

  private httpOptions?: HttpOptions;

  private readonly namePrefix?: string;

  private readonly tags?: Array<TagFilter>;

  private bootstrapProvider: BootstrapProvider;

  private bootstrapOverride: boolean;

  private storageProvider: StorageProvider<ClientFeaturesResponse>;

  private ready: boolean = false;

  private connected: boolean = false;

  private data: FeatureToggleData = {};

  private segments: Map<number, Segment>;

  private eventSource: EventSource | undefined;

  private mode: Mode;

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
    this.url = url;
    this.refreshInterval = refreshInterval;
    this.instanceId = instanceId;
    this.connectionId = connectionId;
    this.appName = appName;
    this.projectName = projectName;
    this.headers = headers;
    this.timeout = timeout;
    this.customHeadersFunction = customHeadersFunction;
    this.httpOptions = httpOptions;
    this.namePrefix = namePrefix;
    this.tags = tags;
    this.bootstrapProvider = bootstrapProvider;
    this.bootstrapOverride = bootstrapOverride;
    this.storageProvider = storageProvider;
    this.segments = new Map();
    this.eventSource = eventSource;
    this.mode = mode;
    this.setupEventSource();
  }

  private setupEventSource() {
    if (this.eventSource) {
      // On re-connect it guarantees catching up with the latest state.
      this.eventSource.addEventListener('unleash-connected', async (event: { data: string }) => {
        await this.handleFlagsFromStream(event);
      });
      this.eventSource.addEventListener('unleash-updated', this.handleFlagsFromStream.bind(this));
      this.eventSource.addEventListener('error', (error: unknown) => {
        this.emit(UnleashEvents.Warn, error);
      });
      this.eventSource.addEventListener('end', (error: unknown) => {
        this.emit(UnleashEvents.Warn, error);
      });
      this.eventSource.addEventListener('fetch-mode', this.handleModeChange.bind(this));
    }
  }

  private async handleFlagsFromStream(event: { data: string }) {
    try {
      const data = parseClientFeaturesDelta(JSON.parse(event.data));
      await this.saveDelta(data);
    } catch (err) {
      this.emit(UnleashEvents.Error, err);
    }
  }

  private async handleModeChange(event: { data: string }) {
    try {
      const newMode = event.data as 'polling' | 'streaming';
      await this.setMode(newMode);
    } catch (err) {
      this.emit(UnleashEvents.Error, new Error(`Failed to handle mode change: ${err}`));
    }
  }

  timedFetch(interval: number) {
    if (interval > 0 && this.mode.type === 'polling') {
      this.timer = setTimeout(() => this.fetch(), interval);
      if (process.env.NODE_ENV !== 'test' && typeof this.timer.unref === 'function') {
        this.timer.unref();
      }
    }
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
    if (this.mode.type === 'streaming' && !this.eventSource) {
      this.eventSource = this.createEventSource();
      this.setupEventSource();
    }

    // the first fetch is used as a fallback even when streaming is enabled
    await Promise.all([
      this.mode.type === 'streaming' ? Promise.resolve() : this.fetch(),
      this.loadBackup(),
      this.loadBootstrap(),
    ]);
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

  async save(response: ClientFeaturesResponse, fromApi: boolean): Promise<void> {
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

  async saveDelta(delta: ClientFeaturesDelta): Promise<void> {
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
    } catch (err: any) {
      this.emit(
        UnleashEvents.Warn,
        `Unleash SDK was unable to load bootstrap.
Message: ${err.message}`,
      );
    }
  }

  private convertToMap(features: FeatureInterface[]): FeatureToggleData {
    const obj = features.reduce(
      (o: { [s: string]: FeatureInterface }, feature: FeatureInterface) => {
        const a = { ...o };
        this.validateFeature(feature);
        a[feature.name] = feature;
        return a;
      },
      {} as { [s: string]: FeatureInterface },
    );

    return obj;
  }

  getFailures(): number {
    return this.failures;
  }

  nextFetch(): number {
    return this.refreshInterval + this.failures * this.refreshInterval;
  }

  private backoff(): number {
    this.failures = Math.min(this.failures + 1, 10);
    return this.nextFetch();
  }

  private countSuccess(): number {
    this.failures = Math.max(this.failures - 1, 0);
    return this.nextFetch();
  }

  // Emits correct error message based on what failed,
  // and returns 0 as the next fetch interval (stop polling)
  private configurationError(url: string, statusCode: number): number {
    this.failures += 1;
    if (statusCode === 401 || statusCode === 403) {
      this.emit(
        UnleashEvents.Error,
        new Error(
          // eslint-disable-next-line max-len
          `${url} responded ${statusCode} which means your API key is not allowed to connect. Stopping refresh of toggles`,
        ),
      );
    }
    return 0;
  }

  // We got a status code we know what to do with, so will log correct message
  // and return the new interval.
  private recoverableError(url: string, statusCode: number): number {
    let nextFetch = this.backoff();
    if (statusCode === 429) {
      this.emit(
        UnleashEvents.Warn,
        // eslint-disable-next-line max-len
        `${url} responded TOO_MANY_CONNECTIONS (429). Backing off`,
      );
    } else if (statusCode === 404) {
      this.emit(
        UnleashEvents.Warn,
        // eslint-disable-next-line max-len
        `${url} responded FILE_NOT_FOUND (404). Backing off`,
      );
    } else if (
      statusCode === 500 ||
      statusCode === 502 ||
      statusCode === 503 ||
      statusCode === 504
    ) {
      this.emit(UnleashEvents.Warn, `${url} responded ${statusCode}. Backing off`);
    }
    return nextFetch;
  }

  private handleErrorCases(url: string, statusCode: number): number {
    if (statusCode === 401 || statusCode === 403) {
      return this.configurationError(url, statusCode);
    } else if (
      statusCode === 404 ||
      statusCode === 429 ||
      statusCode === 500 ||
      statusCode === 502 ||
      statusCode === 503 ||
      statusCode === 504
    ) {
      return this.recoverableError(url, statusCode);
    } else {
      const error = new Error(`Response was not statusCode 2XX, but was ${statusCode}`);
      this.emit(UnleashEvents.Error, error);
      return this.refreshInterval;
    }
  }

  async fetch(): Promise<void> {
    if (this.stopped || !(this.refreshInterval > 0)) {
      return;
    }
    let nextFetch = this.refreshInterval;
    try {
      let mergedTags;
      if (this.tags) {
        mergedTags = this.mergeTagsToStringArray(this.tags);
      }
      const url = getUrl(this.url, this.projectName, this.namePrefix, mergedTags, this.mode);

      const headers = this.customHeadersFunction
        ? await this.customHeadersFunction()
        : this.headers;
      const res = await get({
        url,
        etag: this.etag,
        appName: this.appName,
        timeout: this.timeout,
        instanceId: this.instanceId,
        connectionId: this.connectionId,
        interval: this.refreshInterval,
        headers,
        httpOptions: this.httpOptions,
        supportedSpecVersion: SUPPORTED_SPEC_VERSION,
      });
      if (res.status === 304) {
        // No new data
        this.emit(UnleashEvents.Unchanged);
      } else if (res.ok) {
        nextFetch = this.countSuccess();
        try {
          const data = await res.json();
          if (res.headers.get('etag') !== null) {
            this.etag = res.headers.get('etag') as string;
          } else {
            this.etag = undefined;
          }

          const fetchingModeHeader = res.headers.get('fetch-mode');
          if (fetchingModeHeader === 'streaming' && this.mode.type === 'polling') {
            await this.switchToStreaming();
            return;
          }

          if (this.mode.type === 'polling' && this.mode.format === 'delta') {
            await this.saveDelta(parseClientFeaturesDelta(data));
          } else {
            await this.save(data, true);
          }
        } catch (err) {
          this.emit(UnleashEvents.Error, err);
        }
      } else {
        nextFetch = this.handleErrorCases(url, res.status);
      }
    } catch (err) {
      const e = err as { code: string };
      if (e.code === 'ECONNRESET') {
        nextFetch = Math.max(Math.floor(this.refreshInterval / 2), 1000);
        this.emit(UnleashEvents.Warn, `Socket keep alive error, retrying in ${nextFetch}ms`);
      } else {
        this.emit(UnleashEvents.Error, err);
      }
    } finally {
      this.timedFetch(nextFetch);
    }
  }

  mergeTagsToStringArray(tags: Array<TagFilter>): Array<string> {
    return tags.map((tag) => `${tag.name}:${tag.value}`);
  }

  private async switchToPolling() {
    if (this.mode.type === 'polling') {
      return;
    }

    this.emit(UnleashEvents.Mode, { from: 'streaming', to: 'polling' });

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }

    this.mode = { type: 'polling', format: 'full' };

    await this.fetch();
  }

  private createEventSource(): EventSource {
    return new EventSource(resolveUrl(this.url, './client/streaming'), {
      headers: buildHeaders({
        appName: this.appName,
        instanceId: this.instanceId,
        etag: undefined,
        contentType: undefined,
        custom: this.headers,
        specVersionSupported: SUPPORTED_SPEC_VERSION,
        connectionId: this.connectionId,
      }),
      readTimeoutMillis: 60000,
      initialRetryDelayMillis: 2000,
      maxBackoffMillis: 30000,
      retryResetIntervalMillis: 60000,
      jitterRatio: 0.5,
      errorFilter: function () {
        return true;
      },
    });
  }

  private async switchToStreaming() {
    if (this.mode.type === 'streaming') {
      return;
    }

    this.emit(UnleashEvents.Mode, { from: 'polling', to: 'streaming' });

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    this.mode = { type: 'streaming' };

    this.eventSource = this.createEventSource();
    this.setupEventSource();
  }

  stop() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.removeAllListeners();
    if (this.eventSource) {
      this.eventSource.close();
    }
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

  getMode(): Mode {
    return this.mode;
  }

  async setMode(mode: 'polling' | 'streaming'): Promise<void> {
    if (this.stopped) {
      return;
    }

    const currentMode = this.mode;

    if (currentMode.type === mode) {
      return;
    }

    if (mode === 'polling' && currentMode.type === 'streaming') {
      await this.switchToPolling();
    } else if (mode === 'streaming' && currentMode.type === 'polling') {
      await this.switchToStreaming();
    }
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
