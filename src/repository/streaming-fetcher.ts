import { EventEmitter } from 'node:events';
import { EventSource } from '../event-source';
import { UnleashEvents } from '../events';
import { parseClientFeaturesDelta } from '../feature';
import { buildHeaders } from '../request';
import { resolveUrl } from '../url-utils';
import type { FetcherInterface, StreamingFetchingOptions } from './fetcher';

export class StreamingFetcher extends EventEmitter implements FetcherInterface {
  private eventSource: EventSource | undefined;

  private options: StreamingFetchingOptions;

  constructor(options: StreamingFetchingOptions) {
    super();
    this.options = options;
    this.eventSource = options.eventSource;
  }

  private setupEventSource() {
    if (this.eventSource) {
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
      await this.options.onSaveDelta(data);
    } catch (err) {
      this.emit(UnleashEvents.Error, err);
    }
  }

  private async handleModeChange(event: { data: string }) {
    try {
      const newMode = event.data as 'polling' | 'streaming';
      if (this.options.onModeChange) {
        await this.options.onModeChange(newMode);
      }
    } catch (err) {
      this.emit(UnleashEvents.Error, new Error(`Failed to handle mode change: ${err}`));
    }
  }

  private createEventSource(): EventSource {
    return new EventSource(resolveUrl(this.options.url, './client/streaming'), {
      headers: buildHeaders({
        appName: this.options.appName,
        instanceId: this.options.instanceId,
        etag: undefined,
        contentType: undefined,
        custom: this.options.headers,
        specVersionSupported: '5.2.0',
        connectionId: this.options.connectionId,
      }),
      readTimeoutMillis: 60000,
      initialRetryDelayMillis: 2000,
      maxBackoffMillis: 30000,
      retryResetIntervalMillis: 60000,
      jitterRatio: 0.5,
      errorFilter: () => true,
    });
  }

  async start(): Promise<void> {
    if (!this.eventSource) {
      this.eventSource = this.createEventSource();
    }
    this.setupEventSource();
  }

  stop() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
  }
}
