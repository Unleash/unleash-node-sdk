import { EventEmitter } from 'events';
import { UnleashEvents } from '../events';
import { Mode } from '../unleash-config';
import { FetcherInterface, FetchingOptions } from './fetcher';
import { PollingFetcher } from './polling-fetcher';
import { StreamingFetcher } from './streaming-fetcher';

export class AdaptiveFetcher extends EventEmitter implements FetcherInterface {
  private currentStrategy: FetcherInterface;

  private pollingStrategy: PollingFetcher;

  private streamingStrategy: StreamingFetcher;

  private options: FetchingOptions;

  private stopped = false;

  constructor(options: FetchingOptions) {
    super();
    this.options = { ...options, onModeChange: this.handleModeChange.bind(this) };

    this.pollingStrategy = new PollingFetcher(this.options);
    this.streamingStrategy = new StreamingFetcher(this.options);

    this.setupStrategyEventForwarding(this.pollingStrategy);
    this.setupStrategyEventForwarding(this.streamingStrategy);

    this.currentStrategy =
      this.options.mode.type === 'streaming' ? this.streamingStrategy : this.pollingStrategy;
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

    const currentMode = this.options.mode;

    if (currentMode.type === newMode) {
      return;
    }

    if (newMode === 'polling' && currentMode.type === 'streaming') {
      await this.switchToPolling();
    } else if (newMode === 'streaming' && currentMode.type === 'polling') {
      await this.switchToStreaming();
    }
  }

  private async switchToPolling() {
    if (this.options.mode.type === 'polling') {
      return;
    }

    this.emit(UnleashEvents.Mode, { from: 'streaming', to: 'polling' });

    this.currentStrategy.stop();
    this.options.mode = { type: 'polling', format: 'full' };
    this.currentStrategy = this.pollingStrategy;

    await this.pollingStrategy.start();
  }

  private async switchToStreaming() {
    if (this.options.mode.type === 'streaming') {
      return;
    }

    this.emit(UnleashEvents.Mode, { from: 'polling', to: 'streaming' });

    this.currentStrategy.stop();
    this.options.mode = { type: 'streaming' };
    this.currentStrategy = this.streamingStrategy;

    await this.streamingStrategy.start();
  }

  async start(): Promise<void> {
    await this.currentStrategy.start();
  }

  async setMode(mode: 'polling' | 'streaming'): Promise<void> {
    await this.handleModeChange(mode);
  }

  stop() {
    this.stopped = true;
    this.currentStrategy.stop();
    this.pollingStrategy.stop();
    this.streamingStrategy.stop();
  }

  getMode(): Mode {
    return this.options.mode;
  }

  // Compatibility methods for accessing polling strategy internals
  getFailures(): number {
    return this.pollingStrategy.getFailures();
  }

  nextFetch(): number {
    return this.pollingStrategy.nextFetch();
  }

  async fetch(): Promise<void> {
    if (this.currentStrategy === this.pollingStrategy) {
      return this.pollingStrategy.fetch();
    }
    return Promise.resolve();
  }

  getEtag(): string | undefined {
    return this.pollingStrategy.getEtag();
  }

  setEtag(value: string | undefined): void {
    this.pollingStrategy.setEtag(value);
  }
}
