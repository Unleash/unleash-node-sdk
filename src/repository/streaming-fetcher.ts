import { EventEmitter } from 'node:events';
import { EventSource } from '../event-source';
import { UnleashEvents } from '../events';
import { parseApiResponse } from '../feature';
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

  private readonly connectionId: string;

  private readonly onSave: StreamingFetchingOptions['onSave'];

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
    onSave,
    onModeChange,
  }: StreamingFetchingOptions) {
    super();

    this.url = url;
    this.appName = appName;
    this.instanceId = instanceId;
    this.headers = headers;
    this.connectionId = connectionId;
    this.onSave = onSave;
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

    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      typeof (error as { status?: unknown }).status === 'number'
        ? (error as { status: number }).status
        : undefined;

    const message =
      typeof error === 'string'
        ? error
        : typeof error === 'object' &&
            error !== null &&
            typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : undefined;

    const failEvent: FailEvent =
      typeof statusCode === 'number'
        ? {
            type: 'http-status-error',
            message: message ?? `Stream failed with http status code ${statusCode}`,
            statusCode,
            occurredAt: now,
          }
        : {
            type: 'network-error',
            message: message ?? 'Network error occurred in streaming',
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
      const data = parseApiResponse(JSON.parse(event.data));
      await this.onSave(data, true);
    } catch (err) {
      const errorMessage =
        err instanceof Error && typeof err.message === 'string' ? err.message : String(err);

      this.emit(
        UnleashEvents.Warn,
        `Requesting full re-hydration to prevent data loss because of a failed event process: ${errorMessage}`,
      );

      this.forceRehydration();
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

  private forceRehydration() {
    if (!this.eventSource) {
      return;
    }

    const currentEventSource = this.eventSource;
    this.eventSource = undefined;
    currentEventSource?.close();

    // Explicitly construct a new EventSource, this beast traps the last
    // event id in internal state and if we allow it to attempt to connect with that
    // Unleash will not send a rehydration to us, we'll pick up from where we left off
    this.eventSource = this.createEventSource();
    this.setupEventSource();
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
