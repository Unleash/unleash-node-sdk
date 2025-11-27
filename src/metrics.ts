import { EventEmitter } from 'node:events';
import { sdkVersion } from './details.json';
import { UnleashEvents } from './events';
import type { CustomHeaders, CustomHeadersFunction } from './headers';
import { getAppliedJitter } from './helpers';
import type { HttpOptions } from './http-options';
import type { CollectedMetric, ImpactMetricsDataSource } from './impact-metrics/metric-types';
import { SUPPORTED_SPEC_VERSION } from './repository';
import { post } from './request';
import { resolveUrl, suffixSlash } from './url-utils';

export interface MetricsOptions {
  appName: string;
  instanceId: string;
  connectionId: string;
  strategies: string[];
  metricsInterval: number;
  metricsJitter?: number;
  disableMetrics?: boolean;
  url: string;
  headers?: CustomHeaders;
  customHeadersFunction?: CustomHeadersFunction;
  timeout?: number;
  httpOptions?: HttpOptions;
  metricRegistry?: ImpactMetricsDataSource;
}

interface VariantBucket {
  [s: string]: number;
}

interface Bucket {
  start: Date;
  stop?: Date;
  toggles: { [s: string]: { yes: number; no: number; variants: VariantBucket } };
}

declare var Bun:
  | {
      version: string;
    }
  | undefined;

declare var Deno:
  | {
      version: {
        deno: string;
      };
    }
  | undefined;

type PlatformName = 'bun' | 'deno' | 'node' | 'unknown';

type PlatformData = {
  name: PlatformName;
  version: string;
};

interface BaseMetricsData {
  appName: string;
  instanceId: string;
  connectionId: string;
  platformName: PlatformName;
  platformVersion: string;
  yggdrasilVersion: null;
  specVersion: string;
}

interface MetricsData extends BaseMetricsData {
  bucket: Bucket;
  impactMetrics?: CollectedMetric[];
}

interface RegistrationData extends BaseMetricsData {
  sdkVersion: string;
  strategies: string[];
  started: Date;
  interval: number;
}

export default class Metrics extends EventEmitter {
  private bucket: Bucket;

  private appName: string;

  private instanceId: string;

  private connectionId: string;

  private sdkVersion: string;

  private strategies: string[];

  private metricsInterval: number;

  private metricsJitter: number;

  private failures: number = 0;

  private disabled: boolean;

  private url: string;

  private timer: NodeJS.Timeout | undefined;

  private started: Date;

  private headers?: CustomHeaders;

  private customHeadersFunction?: CustomHeadersFunction;

  private timeout?: number;

  private httpOptions?: HttpOptions;

  private platformData: PlatformData;

  private metricRegistry?: ImpactMetricsDataSource;

  constructor({
    appName,
    instanceId,
    connectionId,
    strategies,
    metricsInterval = 0,
    metricsJitter = 0,
    disableMetrics = false,
    url,
    headers,
    customHeadersFunction,
    timeout,
    httpOptions,
    metricRegistry,
  }: MetricsOptions) {
    super();
    this.disabled = disableMetrics;
    this.metricsInterval = metricsInterval;
    this.metricsJitter = metricsJitter;
    this.appName = appName;
    this.instanceId = instanceId;
    this.connectionId = connectionId;
    this.sdkVersion = sdkVersion;
    this.strategies = strategies;
    this.url = url;
    this.headers = headers;
    this.customHeadersFunction = customHeadersFunction;
    this.started = new Date();
    this.timeout = timeout;
    this.bucket = this.createBucket();
    this.httpOptions = httpOptions;
    this.platformData = this.getPlatformData();
    this.metricRegistry = metricRegistry;
  }

  private getAppliedJitter(): number {
    return getAppliedJitter(this.metricsJitter);
  }

  getFailures(): number {
    return this.failures;
  }

  getInterval(): number {
    if (this.metricsInterval === 0) {
      return 0;
    } else {
      return this.metricsInterval + this.failures * this.metricsInterval + this.getAppliedJitter();
    }
  }

  private startTimer(): void {
    if (this.disabled || this.getInterval() === 0) {
      return;
    }
    this.timer = setTimeout(() => {
      this.sendMetrics();
    }, this.getInterval());

    if (process.env.NODE_ENV !== 'test' && typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  start(): void {
    if (this.metricsInterval > 0) {
      this.startTimer();
      this.registerInstance();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      delete this.timer;
    }
    this.disabled = true;
  }

  async registerInstance(): Promise<boolean> {
    if (this.disabled) {
      return false;
    }
    const url = resolveUrl(suffixSlash(this.url), './client/register');
    const payload = this.getClientData();

    const headers = this.customHeadersFunction ? await this.customHeadersFunction() : this.headers;

    try {
      const res = await post({
        url,
        json: payload,
        appName: this.appName,
        instanceId: this.instanceId,
        connectionId: this.connectionId,
        headers,
        timeout: this.timeout,
        httpOptions: this.httpOptions,
      });
      if (!res.ok) {
        // status code outside 200 range
        this.emit(UnleashEvents.Warn, `${url} returning ${res.status}`, await res.text());
      } else {
        this.emit(UnleashEvents.Registered, payload);
      }
    } catch (err) {
      this.emit(UnleashEvents.Warn, err);
    }
    return true;
  }

  configurationError(url: string, statusCode: number) {
    this.emit(UnleashEvents.Warn, `${url} returning ${statusCode}, stopping metrics`);
    this.metricsInterval = 0;
    this.stop();
  }

  backoff(url: string, statusCode: number): void {
    this.failures = Math.min(10, this.failures + 1);
    // eslint-disable-next-line max-len
    this.emit(
      UnleashEvents.Warn,
      `${url} returning ${statusCode}. Backing off to ${this.failures} times normal interval`,
    );
    this.startTimer();
  }

  async sendMetrics(): Promise<void> {
    if (this.disabled) {
      return;
    }
    const impactMetrics = this.metricRegistry?.collect() || [];

    if (this.bucketIsEmpty() && impactMetrics.length === 0) {
      this.resetBucket();
      this.startTimer();
      this.metricRegistry?.restore(impactMetrics);
      return;
    }
    const url = resolveUrl(suffixSlash(this.url), './client/metrics');
    const payload = this.createMetricsData(impactMetrics);

    const headers = this.customHeadersFunction ? await this.customHeadersFunction() : this.headers;

    try {
      const res = await post({
        url,
        json: payload,
        appName: this.appName,
        instanceId: this.instanceId,
        connectionId: this.connectionId,
        interval: this.metricsInterval,
        headers,
        timeout: this.timeout,
        httpOptions: this.httpOptions,
      });
      if (!res.ok) {
        if (res.status === 403 || res.status === 401) {
          this.configurationError(url, res.status);
        } else if (
          res.status === 404 ||
          res.status === 429 ||
          res.status === 500 ||
          res.status === 502 ||
          res.status === 503 ||
          res.status === 504
        ) {
          this.backoff(url, res.status);
        }
        this.restoreBucket(payload.bucket);
        this.metricRegistry?.restore(impactMetrics);
      } else {
        this.emit(UnleashEvents.Sent, payload);
        this.reduceBackoff();
      }
    } catch (err) {
      this.restoreBucket(payload.bucket);
      this.metricRegistry?.restore(impactMetrics);
      this.emit(UnleashEvents.Warn, err);
      this.startTimer();
    }
  }

  reduceBackoff(): void {
    this.failures = Math.max(0, this.failures - 1);
    this.startTimer();
  }

  assertBucket(name: string): void {
    if (this.disabled) {
      return;
    }
    if (!this.bucket.toggles[name]) {
      this.bucket.toggles[name] = {
        yes: 0,
        no: 0,
        variants: {},
      };
    }
  }

  count(name: string, enabled: boolean): void {
    if (this.disabled) {
      return;
    }
    this.increaseCounter(name, enabled, 1);
    this.emit(UnleashEvents.Count, name, enabled);
  }

  countVariant(name: string, variantName: string): void {
    if (this.disabled) {
      return;
    }
    this.increaseVariantCounter(name, variantName, 1);

    this.emit(UnleashEvents.CountVariant, name, variantName);
  }

  private increaseCounter(name: string, enabled: boolean, inc = 1): void {
    if (inc === 0) {
      return;
    }
    this.assertBucket(name);
    this.bucket.toggles[name][enabled ? 'yes' : 'no'] += inc;
  }

  private increaseVariantCounter(name: string, variantName: string, inc = 1): void {
    this.assertBucket(name);
    if (this.bucket.toggles[name].variants[variantName]) {
      this.bucket.toggles[name].variants[variantName] += inc;
    } else {
      this.bucket.toggles[name].variants[variantName] = inc;
    }
  }

  private bucketIsEmpty(): boolean {
    return Object.keys(this.bucket.toggles).length === 0;
  }

  private createBucket(): Bucket {
    return {
      start: new Date(),
      stop: undefined,
      toggles: {},
    };
  }

  private resetBucket(): void {
    this.bucket = this.createBucket();
  }

  createMetricsData(impactMetrics: CollectedMetric[]): MetricsData {
    const bucket = { ...this.bucket, stop: new Date() };
    this.resetBucket();

    const base: MetricsData = {
      appName: this.appName,
      instanceId: this.instanceId,
      connectionId: this.connectionId,
      bucket,
      platformName: this.platformData.name,
      platformVersion: this.platformData.version,
      yggdrasilVersion: null,
      specVersion: SUPPORTED_SPEC_VERSION,
    };

    if (impactMetrics.length > 0) {
      base.impactMetrics = impactMetrics;
    }

    return base;
  }

  private restoreBucket(bucket: Bucket): void {
    if (this.disabled) {
      return;
    }
    this.bucket.start = bucket.start;

    const { toggles } = bucket;
    Object.keys(toggles).forEach((toggleName) => {
      const toggle = toggles[toggleName];
      this.increaseCounter(toggleName, true, toggle.yes);
      this.increaseCounter(toggleName, false, toggle.no);

      Object.keys(toggle.variants).forEach((variant) => {
        this.increaseVariantCounter(toggleName, variant, toggle.variants[variant]);
      });
    });
  }

  getClientData(): RegistrationData {
    return {
      appName: this.appName,
      instanceId: this.instanceId,
      sdkVersion: this.sdkVersion,
      strategies: this.strategies,
      started: this.started,
      interval: this.metricsInterval,
      connectionId: this.connectionId,
      platformName: this.platformData.name,
      platformVersion: this.platformData.version,
      yggdrasilVersion: null,
      specVersion: SUPPORTED_SPEC_VERSION,
    };
  }

  private getPlatformData(): PlatformData {
    if (typeof Bun !== 'undefined') {
      return { name: 'bun', version: Bun.version };
    } else if (typeof Deno !== 'undefined') {
      return { name: 'deno', version: Deno.version.deno };
    } else if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      return { name: 'node', version: process.versions.node };
    } else {
      return { name: 'unknown', version: 'unknown' };
    }
  }
}
