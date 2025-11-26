import { EventEmitter } from 'events';
import { parseClientFeaturesDelta } from '../feature';
import { buildHeaders } from '../request';
import { resolveUrl } from '../url-utils';
import { UnleashEvents } from '../events';
import { EventSource } from '../event-source';
import { FetcherInterface, StreamingFetchingOptions } from './fetcher';
import { FailEvent, FailoverStrategy } from './streaming-fail-over';

export class StreamingFetcher extends EventEmitter implements FetcherInterface {
  private eventSource: EventSource | undefined;

  private options: StreamingFetchingOptions;

  private readonly failoverStrategy: FailoverStrategy;

  constructor(options: StreamingFetchingOptions) {
    super();
    this.options = options;
    this.eventSource = options.eventSource;
    this.failoverStrategy = new FailoverStrategy(5, 60_000);
  }

  private setupEventSource() {
    if (this.eventSource) {
      this.eventSource.addEventListener('unleash-connected', async (event: { data: string }) => {
        await this.handleFlagsFromStream(event);
      });
      this.eventSource.addEventListener('unleash-updated', this.handleFlagsFromStream.bind(this));
      this.eventSource.addEventListener('error', this.handleErrorEvent.bind(this));
      this.eventSource.addEventListener('end', this.handleServerDisconnect.bind(this));
      this.eventSource.addEventListener('fetch-mode', this.handleModeChange.bind(this));
    }
  }

  private async handleErrorEvent(error: any): Promise<void> {
    const now = new Date();

    const failEvent: FailEvent =
      typeof error?.status === 'number'
        ? {
            type: 'http-status-error',
            message: error.message ?? `Stream failed with http status code ${error.status}`,
            statusCode: error.status,
            occurredAt: now,
          }
        : {
            type: 'network-error',
            message: error.message ?? 'Network error occurred in streaming',
            occurredAt: now,
          };

    await this.handleFailoverDecision(failEvent);
  }

  private async handleServerDisconnect(): Promise<void> {
    const failEvent: FailEvent = {
      type: 'network-error',
      message: 'Server closed the streaming connection',
      occurredAt: new Date(),
    };

    await this.handleFailoverDecision(failEvent);
  }

  private async handleFailoverDecision(event: FailEvent): Promise<void> {
    const now = new Date();
    const shouldFailover = this.failoverStrategy.shouldFailover(event, now);

    if (!shouldFailover) {
      return;
    }

    this.emit(UnleashEvents.Warn, event.message);

    if (this.options.onModeChange) {
      await this.options.onModeChange('polling');
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
    const newMode = event.data as 'polling' | 'streaming';

    if (newMode === 'polling') {
      await this.handleFailoverDecision({
        type: 'server-hint',
        event: `polling`,
        message: 'Server has explicitly requested switching to polling mode',
        occurredAt: new Date(),
      });
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
      errorFilter: function () {
        return true;
      },
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
