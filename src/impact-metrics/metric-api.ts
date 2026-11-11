import type { UnleashEngine } from '@unleash/yggdrasil-engine';

// Is it super major overkill to wrap the engine in this? Yeah could be. But I really, really
// don't want to expose the engine directly. Doesn't matter for TS users. JS users
// tend to be a little wild in what they will do with the exposed API so maybe just safer to just not
export class MetricsAPI {
  constructor(private engine: UnleashEngine) {}

  defineCounter(name: string, help: string) {
    this.engine.defineCounter(name, help);
  }

  defineGauge(name: string, help: string) {
    this.engine.defineGauge(name, help);
  }

  defineHistogram(name: string, help: string, buckets?: number[]) {
    this.engine.defineHistogram(name, help, buckets);
  }

  incrementCounter(name: string, value?: number): void {
    this.engine.incrementCounter(name, value ?? 1);
  }

  updateGauge(name: string, value: number): void {
    this.engine.updateGauge(name, value);
  }

  observeHistogram(name: string, value: number): void {
    this.engine.observeHistogram(name, value);
  }
}
