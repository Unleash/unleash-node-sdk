import { EventEmitter } from 'events';
import { UnleashEvents } from '../events';
import { Mode } from '../unleash-config';
import { FetcherInterface, FetchingOptions } from './fetcher';
import { PollingFetcher } from './polling-fetcher';
import { StreamingFetcher } from './streaming-fetcher';

export class AdaptiveFetcher extends EventEmitter implements FetcherInterface {
  private currentFetcher: FetcherInterface;

  private pollingFetcher: PollingFetcher;

  private streamingFetcher: StreamingFetcher;

  private options: FetchingOptions;

  private stopped = false;

  constructor(options: FetchingOptions) {
    super();
    this.options = { ...options, onModeChange: this.handleModeChange.bind(this) };

    this.pollingFetcher = new PollingFetcher(this.options);
    this.streamingFetcher = new StreamingFetcher(this.options);

    this.setupStrategyEventForwarding(this.pollingFetcher);
    this.setupStrategyEventForwarding(this.streamingFetcher);

    this.currentFetcher =
      this.options.mode.type === 'streaming' ? this.streamingFetcher : this.pollingFetcher;
  }

  private setupStrategyEventForwarding(strategy: FetcherInterface) {
    strategy.on(UnleashEvents.Error, (err) => this.emit(UnleashEvents.Error, err));
    strategy.on(UnleashEvents.Warn, (msg) => this.emit(UnleashEvents.Warn, msg));
    strategy.on(UnleashEvents.Unchanged, () => this.emit(UnleashEvents.Unchanged));
  }

  private async handleModeChange(newMode: 'polling' | 'streaming'): Promise<void> {
    if (this.stopped) {
      return;
    }

    if (newMode === 'polling') {
      await this.switchToPolling();
    } else if (newMode === 'streaming') {
      await this.switchToStreaming();
    }
  }

  private async switchToPolling() {
    if (this.currentFetcher === this.pollingFetcher) {
      return;
    }

    this.emit(UnleashEvents.Mode, { from: 'streaming', to: 'polling' });

    this.currentFetcher.stop();
    this.currentFetcher = this.pollingFetcher;

    await this.currentFetcher.start();
  }

  private async switchToStreaming() {
    if (this.currentFetcher === this.streamingFetcher) {
      return;
    }

    this.emit(UnleashEvents.Mode, { from: 'polling', to: 'streaming' });

    this.currentFetcher.stop();
    this.currentFetcher = this.streamingFetcher;

    await this.currentFetcher.start();
  }

  async start(): Promise<void> {
    await this.currentFetcher.start();
  }

  async setMode(mode: 'polling' | 'streaming'): Promise<void> {
    await this.handleModeChange(mode);
  }

  stop() {
    this.stopped = true;
    this.currentFetcher.stop();
    this.pollingFetcher.stop();
    this.streamingFetcher.stop();
  }

  getMode(): Mode {
    if (this.currentFetcher === this.streamingFetcher) return { type: 'streaming' };
    return { type: 'polling', format: 'full' };
  }

  // Compatibility methods for accessing polling strategy internals
  getFailures(): number {
    return this.pollingFetcher.getFailures();
  }

  nextFetch(): number {
    return this.pollingFetcher.nextFetch();
  }

  async fetch(): Promise<void> {
    if (this.currentFetcher === this.pollingFetcher) {
      return this.pollingFetcher.fetch();
    }
  }

  getEtag(): string | undefined {
    return this.pollingFetcher.getEtag();
  }

  setEtag(value: string | undefined): void {
    this.pollingFetcher.setEtag(value);
  }
}
