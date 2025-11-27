import { EventEmitter } from 'node:events';
import { UnleashEvents } from '../events';
import { parseClientFeaturesDelta } from '../feature';
import { get } from '../request';
import type { TagFilter } from '../tags';
import getUrl from '../url-utils';
import type { FetcherInterface, PollingFetchingOptions } from './fetcher';

export class PollingFetcher extends EventEmitter implements FetcherInterface {
  private timer: NodeJS.Timeout | undefined;

  private stopped = false;

  private failures: number = 0;

  private etag: string | undefined;

  private options: PollingFetchingOptions;

  constructor(options: PollingFetchingOptions) {
    super();
    this.options = options;
    this.etag = options.etag;
  }

  timedFetch(interval: number) {
    if (interval > 0) {
      this.timer = setTimeout(() => this.fetch(), interval);
      if (process.env.NODE_ENV !== 'test' && typeof this.timer.unref === 'function') {
        this.timer.unref();
      }
    }
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.fetch();
  }

  nextFetch(): number {
    return this.options.refreshInterval + this.failures * this.options.refreshInterval;
  }

  getFailures(): number {
    return this.failures;
  }

  getEtag(): string | undefined {
    return this.etag;
  }

  setEtag(value: string | undefined): void {
    this.etag = value;
  }

  private backoff(): number {
    this.failures = Math.min(this.failures + 1, 10);
    return this.nextFetch();
  }

  private countSuccess(): number {
    this.failures = Math.max(this.failures - 1, 0);
    return this.nextFetch();
  }

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

  private recoverableError(url: string, statusCode: number): number {
    const nextFetch = this.backoff();
    if (statusCode === 429) {
      this.emit(UnleashEvents.Warn, `${url} responded TOO_MANY_CONNECTIONS (429). Backing off`);
    } else if (statusCode === 404) {
      this.emit(UnleashEvents.Warn, `${url} responded FILE_NOT_FOUND (404). Backing off`);
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
      return this.options.refreshInterval;
    }
  }

  async fetch(): Promise<void> {
    if (this.stopped || !(this.options.refreshInterval > 0)) {
      return;
    }
    let nextFetch: number = this.options.refreshInterval;
    try {
      let mergedTags: string[] | undefined;
      if (this.options.tags) {
        mergedTags = this.mergeTagsToStringArray(this.options.tags);
      }
      const url = getUrl(
        this.options.url,
        this.options.projectName,
        this.options.namePrefix,
        mergedTags,
        this.options.mode,
      );

      const headers = this.options.customHeadersFunction
        ? await this.options.customHeadersFunction()
        : this.options.headers;
      const res = await get({
        url,
        etag: this.etag,
        appName: this.options.appName,
        timeout: this.options.timeout,
        instanceId: this.options.instanceId,
        connectionId: this.options.connectionId,
        interval: this.options.refreshInterval,
        headers,
        httpOptions: this.options.httpOptions,
        supportedSpecVersion: '5.2.0',
      });
      if (res.status === 304) {
        this.emit(UnleashEvents.Unchanged);
        nextFetch = this.countSuccess();
      } else if (res.ok) {
        nextFetch = this.countSuccess();
        try {
          const data = await res.json();
          if (res.headers.get('etag') !== null) {
            this.etag = res.headers.get('etag') as string;
          } else {
            this.etag = undefined;
          }

          const fetchingModeHeader = res.headers.get('fetch-mode') as
            | 'polling'
            | 'streaming'
            | null;
          if (fetchingModeHeader === 'streaming' && this.options.onModeChange) {
            await this.options.onModeChange('streaming');
            return;
          }

          if (this.options.mode.type === 'polling' && this.options.mode.format === 'delta') {
            await this.options.onSaveDelta(parseClientFeaturesDelta(data));
          } else {
            await this.options.onSave(data, true);
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
        nextFetch = Math.max(Math.floor(this.options.refreshInterval / 2), 1000);
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

  stop() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }
}
