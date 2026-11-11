import { EventEmitter } from 'node:events';
import { getSpecVersion, getYggdrasilVersion, type UnleashEngine } from '@unleash/yggdrasil-engine';
import { sdkVersion } from './details.json';
import { UnleashEvents } from './events';
import type { CustomHeaders, CustomHeadersFunction } from './headers';
import { getAppliedJitter } from './helpers';
import type { HttpOptions } from './http-options';
import {
  getPlatformData,
  type MetricsData,
  type PlatformData,
  post,
  type RegistrationData,
} from './request';
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
  sdkFlavor?: string;
  sdkFlavorVersion?: string;
  engine: UnleashEngine;
}

export default class Metrics extends EventEmitter {
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

  private sdkFlavor?: string;

  private sdkFlavorVersion?: string;

  private engine: UnleashEngine;

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
    sdkFlavor,
    sdkFlavorVersion,
    engine,
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
    this.httpOptions = httpOptions;
    this.platformData = getPlatformData();
    this.sdkFlavor = sdkFlavor;
    this.sdkFlavorVersion = sdkFlavorVersion;
    this.engine = engine;
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
    if (this.timer) {
      clearTimeout(this.timer);
      delete this.timer;
    }
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

  // Temporary bridge while evaluation still uses the JavaScript client.
  count(name: string, enabled: boolean): void {
    this.engine.count(name, enabled);
    if (!this.disabled) this.emit(UnleashEvents.Count, name, enabled);
  }

  countVariant(name: string, variant: string): void {
    this.engine.countVariant(name, variant);
    if (!this.disabled) this.emit(UnleashEvents.CountVariant, name, variant);
  }

  isEnabled(): boolean {
    return !this.disabled;
  }

  async registerInstance(): Promise<boolean> {
    if (this.disabled) {
      return false;
    }
    const url = resolveUrl(suffixSlash(this.url), './client/register');
    const payload = this.getClientData();

    try {
      const headers = this.customHeadersFunction
        ? await this.customHeadersFunction()
        : this.headers;
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
      if (!this.disabled) this.emit(UnleashEvents.Warn, err);
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
    this.emit(
      UnleashEvents.Warn,
      `${url} returning ${statusCode}. Backing off to ${this.failures} times normal interval`,
    );
    this.startTimer();
  }

  async sendMetrics(): Promise<void> {
    if (this.disabled) return;
    let metrics: ReturnType<UnleashEngine['getMetrics']> | undefined;

    try {
      const headers = this.customHeadersFunction
        ? await this.customHeadersFunction()
        : this.headers;
      if (this.disabled) return;

      metrics = this.engine.getMetrics();
      if (!metrics.bucket && metrics.impactMetrics.length === 0) return;

      const url = resolveUrl(suffixSlash(this.url), './client/metrics');
      const payload: MetricsData = {
        ...metrics,
        appName: this.appName,
        instanceId: this.instanceId,
        connectionId: this.connectionId,
        platformName: this.platformData.name,
        platformVersion: this.platformData.version,
        yggdrasilVersion: getYggdrasilVersion(),
        specVersion: getSpecVersion(),
        sdkFlavor: this.sdkFlavor,
        sdkFlavorVersion: this.sdkFlavorVersion,
      };

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

      if (this.disabled) return;

      if (!res.ok) {
        // restore bucket before any warn/error event fires as it can disable the instance
        const failedMetrics = metrics;
        metrics = undefined;
        this.engine.restoreMetrics(failedMetrics);

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
      } else {
        metrics = undefined;
        this.emit(UnleashEvents.Sent, payload);
        this.reduceBackoff();
      }
    } catch (err) {
      if (this.disabled) return;
      if (metrics) this.engine.restoreMetrics(metrics);
      this.emit(UnleashEvents.Warn, err);
    } finally {
      this.startTimer();
    }
  }

  reduceBackoff(): void {
    this.failures = Math.max(0, this.failures - 1);
    this.startTimer();
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
      yggdrasilVersion: getYggdrasilVersion(),
      specVersion: getSpecVersion(),
      sdkFlavor: this.sdkFlavor,
      sdkFlavorVersion: this.sdkFlavorVersion,
    };
  }
}
