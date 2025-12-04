import { EventEmitter } from 'node:stream';
import type Client from '../client';
import { type StaticContext, UnleashEvents } from '../unleash';
import type { ImpactMetricRegistry, MetricFlagContext, MetricLabels } from './metric-types';

export class MetricsAPI extends EventEmitter {
  constructor(
    private metricRegistry: ImpactMetricRegistry,
    private variantResolver: Pick<Client, 'forceGetVariant'>,
    private staticContext: StaticContext,
  ) {
    super();
  }

  defineCounter(name: string, help: string) {
    if (!name || !help) {
      this.emit(UnleashEvents.Warn, `Counter name or help cannot be empty: ${name}, ${help}.`);
      return;
    }
    const labelNames = ['featureName', 'appName', 'environment'];
    this.metricRegistry.counter({ name, help, labelNames });
  }

  defineGauge(name: string, help: string) {
    if (!name || !help) {
      this.emit(UnleashEvents.Warn, `Gauge name or help cannot be empty: ${name}, ${help}.`);
      return;
    }
    const labelNames = ['featureName', 'appName', 'environment'];
    this.metricRegistry.gauge({ name, help, labelNames });
  }

  defineHistogram(name: string, help: string, buckets?: number[]) {
    if (!name || !help) {
      this.emit(UnleashEvents.Warn, `Histogram name or help cannot be empty: ${name}, ${help}.`);
      return;
    }
    const labelNames = ['featureName', 'appName', 'environment'];
    this.metricRegistry.histogram({ name, help, labelNames, buckets: buckets || [] });
  }

  private getFlagLabels(flagContext?: MetricFlagContext): MetricLabels {
    const flagLabels: MetricLabels = {};
    if (flagContext) {
      for (const flag of flagContext.flagNames) {
        const variant = this.variantResolver.forceGetVariant(flag, flagContext.context);

        if (variant.enabled) {
          flagLabels[flag] = variant.name;
        } else if (variant.feature_enabled) {
          flagLabels[flag] = 'enabled';
        } else {
          flagLabels[flag] = 'disabled';
        }
      }
    }
    return flagLabels;
  }

  incrementCounter(name: string, value?: number, flagContext?: MetricFlagContext): void {
    const counter = this.metricRegistry.getCounter(name);
    if (!counter) {
      this.emit(
        UnleashEvents.Warn,
        `Counter ${name} not defined, this counter will not be incremented.`,
      );
      return;
    }

    const flagLabels = this.getFlagLabels(flagContext);

    const labels = {
      ...flagLabels,
      ...this.staticContext,
    };

    counter.inc(value, labels);
  }

  updateGauge(name: string, value: number, flagContext?: MetricFlagContext): void {
    const gauge = this.metricRegistry.getGauge(name);
    if (!gauge) {
      this.emit(UnleashEvents.Warn, `Gauge ${name} not defined, this gauge will not be updated.`);
      return;
    }

    const flagLabels = this.getFlagLabels(flagContext);

    const labels = {
      ...flagLabels,
      ...this.staticContext,
    };

    gauge.set(value, labels);
  }

  observeHistogram(name: string, value: number, flagContext?: MetricFlagContext): void {
    const histogram = this.metricRegistry.getHistogram(name);
    if (!histogram) {
      this.emit(
        UnleashEvents.Warn,
        `Histogram ${name} not defined, this histogram will not be updated.`,
      );
      return;
    }

    const flagLabels = this.getFlagLabels(flagContext);

    const labels = {
      ...flagLabels,
      ...this.staticContext,
    };

    histogram.observe(value, labels);
  }
}
