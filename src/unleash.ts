import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { UnleashEngine } from '@unleash/yggdrasil-engine';
import Client from './client';
import type { Context } from './context';
import { createImpressionEvent, type ImpressionEvent, UnleashEvents } from './events';
import type { EnhancedFeatureInterface, FeatureInterface } from './feature';
import {
  createFallbackFunction,
  type FallbackFunction,
  generateHashOfConfig,
  generateInstanceId,
} from './helpers';
import { MetricsAPI } from './impact-metrics/metric-api';
import type { Name } from './index';
import Metrics from './metrics';
import Repository, { type RepositoryInterface } from './repository';
import { resolveBootstrapProvider } from './repository/bootstrap-provider';
import FileStorageProvider from './repository/storage-provider-file';
import { defaultStrategies, Strategy } from './strategy';
import { UnleashConfig } from './unleash-config';
import { uuidv4 } from './uuidv4';
import { defaultVariant, type Variant, type VariantWithFeatureStatus } from './variant';

export { Strategy, UnleashConfig, UnleashEvents };

const BACKUP_PATH: string = tmpdir();

export interface StaticContext {
  appName: string;
  environment: string;
}

export class Unleash extends EventEmitter {
  private static configSignature?: string;

  private static instance?: Unleash;

  private static instanceCount: number = 0;

  private repository: RepositoryInterface;

  protected client: Client;

  private metrics: Metrics;

  protected staticContext: StaticContext;

  private synchronized: boolean = false;

  private ready: boolean = false;

  private started: boolean = false;

  private engine = new UnleashEngine();

  private destroyed = false;

  public impactMetrics: MetricsAPI;

  constructor({
    appName,
    environment = 'default',
    projectName,
    instanceId,
    url,
    refreshInterval = 15 * 1000,
    metricsInterval = 60 * 1000,
    metricsJitter = 0,
    disableMetrics = false,
    backupPath = BACKUP_PATH,
    strategies = [],
    fetcher,
    namePrefix,
    customHeaders,
    customHeadersFunction,
    timeout,
    httpOptions,
    tags,
    bootstrap = {},
    bootstrapOverride,
    storageProvider,
    disableAutoStart = false,
    skipInstanceCountWarning = false,
    experimentalMode = { type: 'polling', format: 'full' },
    sdkFlavor,
    sdkFlavorVersion,
  }: UnleashConfig) {
    super();

    this.engine.registerCustomStrategies(strategies);
    Unleash.instanceCount++;

    this.on(UnleashEvents.Error, (error) => {
      // Only if there does not exist other listeners for this event.
      if (this.listenerCount(UnleashEvents.Error) === 1) {
        console.error(error);
      }
    });

    if (!skipInstanceCountWarning && Unleash.instanceCount > 10) {
      process.nextTick(() => {
        const error = new Error('The unleash SDK has been initialized more than 10 times');
        this.emit(UnleashEvents.Error, error);
      });
    }

    if (!url) {
      throw new Error('Unleash API "url" is required');
    }
    if (!appName) {
      throw new Error('Unleash client "appName" is required');
    }

    const unleashUrl = this.cleanUnleashUrl(url);

    const unleashInstanceId = generateInstanceId(instanceId);

    const unleashConnectionId = uuidv4();

    this.staticContext = { appName, environment };

    const bootstrapProvider = resolveBootstrapProvider(bootstrap, appName, unleashInstanceId);

    this.repository = new Repository({
      projectName,
      url: unleashUrl,
      appName,
      instanceId: unleashInstanceId,
      connectionId: unleashConnectionId,
      refreshInterval,
      headers: customHeaders,
      customHeadersFunction,
      timeout,
      httpOptions,
      namePrefix,
      tags,
      bootstrapProvider,
      bootstrapOverride,
      fetcher,
      engine: this.engine,
      mode: experimentalMode,
      storageProvider: storageProvider || new FileStorageProvider(backupPath),
    });

    this.repository.on(UnleashEvents.Ready, () => {
      this.ready = true;
      process.nextTick(() => {
        this.emit(UnleashEvents.Ready);
      });
    });

    this.repository.on(UnleashEvents.Error, (err) => {
      err.message = `Unleash Repository error: ${err.message}`;
      this.emit(UnleashEvents.Error, err);
    });

    this.repository.on(UnleashEvents.Warn, (msg) => this.emit(UnleashEvents.Warn, msg));

    this.repository.on(UnleashEvents.Unchanged, (msg) => this.emit(UnleashEvents.Unchanged, msg));

    this.repository.on(UnleashEvents.Changed, (data) => {
      this.ready = true;
      this.emit(UnleashEvents.Changed, data);

      // Only emit the fully synchronized event the first time.
      if (!this.synchronized) {
        this.synchronized = true;
        process.nextTick(() => this.emit(UnleashEvents.Synchronized));
      }
    });

    // setup client
    const supportedStrategies = strategies.concat(defaultStrategies);
    this.client = new Client(this.repository, supportedStrategies);
    this.client.on(UnleashEvents.Error, (err) => this.emit(UnleashEvents.Error, err));
    this.client.on(UnleashEvents.Impression, (e: ImpressionEvent) =>
      this.emit(UnleashEvents.Impression, e),
    );

    this.metrics = new Metrics({
      disableMetrics,
      appName,
      instanceId: unleashInstanceId,
      connectionId: unleashConnectionId,
      strategies: supportedStrategies.map((strategy: Strategy) => strategy.name),
      metricsInterval,
      metricsJitter,
      url: unleashUrl,
      headers: customHeaders,
      customHeadersFunction,
      timeout,
      httpOptions,
      engine: this.engine,
      sdkFlavor,
      sdkFlavorVersion,
    });

    this.impactMetrics = new MetricsAPI(this.engine);

    this.metrics.on(UnleashEvents.Error, (err) => {
      err.message = `Unleash Metrics error: ${err.message}`;
      this.emit(UnleashEvents.Error, err);
    });

    this.metrics.on(UnleashEvents.Warn, (msg) => this.emit(UnleashEvents.Warn, msg));
    this.metrics.on(UnleashEvents.Sent, (payload) => this.emit(UnleashEvents.Sent, payload));

    this.metrics.on(UnleashEvents.Count, (name, enabled) => {
      this.emit(UnleashEvents.Count, name, enabled);
    });
    this.metrics.on(UnleashEvents.Registered, (payload) => {
      this.emit(UnleashEvents.Registered, payload);
    });

    if (!disableAutoStart) {
      process.nextTick(async () => this.start());
    }
  }

  /**
   * Will only give you an instance the first time you call the method,
   * and then return the same instance.
   * @param config The Unleash Config.
   * @returns the Unleash instance
   */
  static getInstance(config: UnleashConfig) {
    const cleanConfig = {
      ...config,
      // Remove complex objects
      fetcher: undefined,
      customHeadersFunction: undefined,
      storageProvider: undefined,
    };
    const configSignature = generateHashOfConfig(cleanConfig);
    if (Unleash.instance) {
      if (configSignature !== Unleash.configSignature) {
        throw new Error('You already have an Unleash instance with a different configuration.');
      }
      return Unleash.instance;
    }
    const instance = new Unleash(config);
    Unleash.instance = instance;
    Unleash.configSignature = configSignature;
    return instance;
  }

  private cleanUnleashUrl(url: string): string {
    let unleashUrl = url;
    if (unleashUrl.endsWith('/features')) {
      const oldUrl = unleashUrl;
      process.nextTick(() =>
        this.emit(
          UnleashEvents.Warn,
          `Unleash server URL "${oldUrl}" should no longer link directly to /features`,
        ),
      );
      unleashUrl = unleashUrl.replace(/\/features$/, '');
    }

    if (!unleashUrl.endsWith('/')) {
      unleashUrl += '/';
    }
    return unleashUrl;
  }

  isSynchronized() {
    return this.synchronized;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await Promise.all([this.repository.start(), this.metrics.start()]);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.repository.stop();
    this.metrics.stop();
    this.engine.destroy();
    Unleash.instance = undefined;
    Unleash.configSignature = undefined;
    Unleash.instanceCount--;
  }

  isEnabled(name: Name, context?: Context, fallbackFunction?: FallbackFunction): boolean;
  isEnabled(name: Name, context?: Context, fallbackValue?: boolean): boolean;
  isEnabled(name: Name, context: Context = {}, fallback?: FallbackFunction | boolean): boolean {
    const enhancedContext = { ...this.staticContext, ...context };

    if (this.ready && !this.destroyed) {
      // the engine counts automatically so long as the flag exists so we skip the count here
      // internal handling of counting is done for performance reasons on the happy path
      const enabledResult = this.engine.isEnabled(name, enhancedContext);
      const enabled = enabledResult.enabled;
      if (enabled != null) {
        if (enabledResult.impressionData) {
          this.emit(
            UnleashEvents.Impression,
            createImpressionEvent({
              featureName: name,
              context: enhancedContext,
              enabled,
              eventType: 'isEnabled',
            }),
          );
        }

        this.emitCount(name, enabled);
        return enabled;
      }
    }

    const enabled = createFallbackFunction(name, enhancedContext, fallback)();

    if (!this.ready) {
      this.emit(
        UnleashEvents.Warn,
        `Unleash has not been initialized yet. isEnabled('${name}') defaulted to ${enabled}`,
      );
    }

    if (!this.destroyed) this.engine.count(name, enabled);
    this.emitCount(name, enabled);
    return enabled;
  }

  getVariant(
    name: string,
    context: Context = {},
    fallbackVariant?: Variant,
  ): VariantWithFeatureStatus {
    const enhancedContext = { ...this.staticContext, ...context };
    const result =
      this.ready && !this.destroyed ? this.engine.checkVariant(name, enhancedContext) : undefined;
    const featureEnabled = result?.variant?.featureEnabled ?? false;
    const selected = result?.variant?.enabled
      ? result.variant
      : (fallbackVariant ?? defaultVariant);
    const variant: VariantWithFeatureStatus = {
      ...selected,
      // Engine payload types are strings; the SDK's public payload enum remains
      // the contract for callers.
      payload: selected.payload as Variant['payload'],
      feature_enabled: featureEnabled,
      featureEnabled,
    };

    if (result?.impressionData) {
      this.emit(
        UnleashEvents.Impression,
        createImpressionEvent({
          featureName: name,
          context: enhancedContext,
          enabled: variant.enabled,
          eventType: 'getVariant',
          variant: variant.name,
        }),
      );
    }

    if (!this.ready) {
      this.emit(
        UnleashEvents.Warn,
        `Unleash has not been initialized yet. getVariant('${name}') defaulted to ${JSON.stringify(variant)}`,
      );
    }

    if (!this.destroyed) {
      this.engine.count(name, featureEnabled);
      if (variant.name) this.engine.countVariant(name, variant.name);
    }
    this.emitCount(name, featureEnabled);
    return variant;
  }

  forceGetVariant(name: string, context: Context = {}, fallbackVariant?: Variant): Variant {
    return this.getVariant(name, context, fallbackVariant);
  }

  getFeatureToggleDefinition(toggleName: string): FeatureInterface | undefined {
    return this.repository.getToggle(toggleName);
  }

  getFeatureToggleDefinitions(): Array<FeatureInterface>;
  getFeatureToggleDefinitions(withFullSegments: boolean): Array<EnhancedFeatureInterface>;
  getFeatureToggleDefinitions(
    withFullSegments?: boolean,
  ): Array<FeatureInterface | EnhancedFeatureInterface> {
    if (withFullSegments === true) {
      return this.repository.getTogglesWithSegmentData();
    }
    return this.repository.getToggles();
  }

  count(toggleName: string, enabled: boolean) {
    this.metrics.count(toggleName, enabled);
  }

  countVariant(toggleName: string, variantName: string) {
    this.metrics.countVariant(toggleName, variantName);
  }

  private emitCount(name: string, enabled: boolean): void {
    if (!this.destroyed && this.metrics.isEnabled()) {
      this.emit(UnleashEvents.Count, name, enabled);
    }
  }

  flushMetrics(): Promise<void> {
    return this.metrics.sendMetrics();
  }

  async destroyWithFlush(): Promise<void> {
    await this.flushMetrics();
    this.destroy();
  }

  /**
   * Experimental: Change the fetching mode at runtime
   * @param mode The new mode to switch to ('polling' or 'streaming')
   */
  async setExperimentalMode(mode: 'polling' | 'streaming'): Promise<void> {
    if (this.repository.setMode) {
      return this.repository.setMode(mode);
    }
    throw new Error('setMode is not supported by this repository implementation');
  }
}
