import { EventEmitter } from 'node:events';
import { EventSource } from '../event-source';
import { UnleashEvents } from '../events';
import { parseClientFeaturesDelta } from '../feature';
import { buildHeaders } from '../request';
import { resolveUrl } from '../url-utils';
import type { FetcherInterface, StreamingFetchingOptions } from './fetcher';
import { type FailEvent, FailoverStrategy } from './streaming-fail-over';

export class StreamingFetcher extends EventEmitter implements FetcherInterface {
  private eventSource: EventSource | undefined;

  private readonly url: string;

  private readonly appName: string;

  private readonly instanceId: string;

  private readonly headers?: Record<string, string>;

  private readonly connectionId?: string;

  private readonly onSaveDelta: StreamingFetchingOptions['onSaveDelta'];

  private readonly onModeChange?: StreamingFetchingOptions['onModeChange'];

  private readonly failoverStrategy: FailoverStrategy;

  constructor({
    url,
    appName,
    instanceId,
    headers,
    connectionId,
    eventSource,
    maxFailuresUntilFailover = 5,
    failureWindowMs = 60_000,
    onSaveDelta,
    onModeChange,
  }: StreamingFetchingOptions) {
    super();

    this.url = url;
    this.appName = appName;
    this.instanceId = instanceId;
    this.headers = headers;
    this.connectionId = connectionId;
    this.onSaveDelta = onSaveDelta;
    this.onModeChange = onModeChange;

    this.eventSource = eventSource;
    this.failoverStrategy = new FailoverStrategy(maxFailuresUntilFailover, failureWindowMs);
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

  private async handleErrorEvent(error: unknown): Promise<void> {
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

    if (this.onModeChange) {
      await this.onModeChange('polling');
    }
  }

  private async handleFlagsFromStream(event: { data: string }) {
    try {
      const data = parseClientFeaturesDelta(JSON.parse(event.data));
      await this.onSaveDelta(data);
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
    return new EventSource(resolveUrl(this.url, './client/streaming'), {
      headers: buildHeaders({
        appName: this.appName,
        instanceId: this.instanceId,
        etag: undefined,
        contentType: undefined,
        custom: this.headers,
        specVersionSupported: '5.2.0',
        connectionId: this.connectionId,
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
