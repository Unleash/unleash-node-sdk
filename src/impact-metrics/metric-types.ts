import { Context } from '../context';

type LabelValuesKey = string;

function getLabelKey(labels?: MetricLabels): LabelValuesKey {
  if (!labels) return '';
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(',');
}

function parseLabelKey(key: string): MetricLabels {
  const labels: MetricLabels = {};
  if (!key) return labels;
  for (const pair of key.split(',')) {
    const [k, v] = pair.split('=');
    labels[k] = v;
  }
  return labels;
}

export interface NumericMetricSample {
  labels: MetricLabels;
  value: number;
}

export interface BucketMetricSample {
  labels: MetricLabels;
  count: number;
  sum: number;
  buckets: Array<{ le: number | '+Inf'; count: number }>;
}

export type MetricSample = NumericMetricSample | BucketMetricSample;

const isNumericMetricSample = (sample: MetricSample): sample is NumericMetricSample =>
  'value' in sample;

const isBucketMetricSample = (sample: MetricSample): sample is BucketMetricSample =>
  'buckets' in sample;

export type CollectedMetric =
  | {
      name: string;
      help: string;
      type: 'counter' | 'gauge';
      samples: NumericMetricSample[];
    }
  | {
      name: string;
      help: string;
      type: 'histogram';
      samples: BucketMetricSample[];
    };

interface CollectibleMetric {
  collect(): CollectedMetric;
}

class CounterImpl implements Counter {
  private values = new Map<LabelValuesKey, number>();

  constructor(private opts: MetricOptions) {}

  inc(value?: number, labels?: MetricLabels): void {
    const delta = value ?? 1;
    const key = getLabelKey(labels);
    const current = this.values.get(key) ?? 0;
    this.values.set(key, current + delta);
  }

  collect(): CollectedMetric {
    const samples: NumericMetricSample[] = [...this.values.entries()].map(([key, value]) => ({
      labels: parseLabelKey(key),
      value,
    }));

    this.values.clear();

    return {
      name: this.opts.name,
      help: this.opts.help,
      type: 'counter',
      samples,
    };
  }
}

class GaugeImpl implements Gauge {
  private values = new Map<LabelValuesKey, number>();

  constructor(private opts: MetricOptions) {}

  inc(value?: number, labels?: MetricLabels): void {
    const delta = value ?? 1;
    const key = getLabelKey(labels);
    const current = this.values.get(key) ?? 0;
    this.values.set(key, current + delta);
  }

  dec(value?: number, labels?: MetricLabels): void {
    const delta = value ?? 1;
    const key = getLabelKey(labels);
    const current = this.values.get(key) ?? 0;
    this.values.set(key, current - delta);
  }

  set(value: number, labels?: MetricLabels): void {
    const key = getLabelKey(labels);
    this.values.set(key, value);
  }

  collect(): CollectedMetric {
    const samples: NumericMetricSample[] = [...this.values.entries()].map(([key, value]) => ({
      labels: parseLabelKey(key),
      value,
    }));

    this.values.clear();

    return {
      name: this.opts.name,
      help: this.opts.help,
      type: 'gauge',
      samples,
    };
  }
}

interface HistogramData {
  count: number;
  sum: number;
  buckets: Map<number, number>;
}

class HistogramImpl implements Histogram {
  private values = new Map<LabelValuesKey, HistogramData>();

  private buckets: number[];

  constructor(private opts: BucketMetricOptions) {
    const buckets = opts.buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
    const sortedBuckets = [...new Set(buckets.filter((b) => b !== Infinity))].sort((a, b) => a - b);
    this.buckets = [...sortedBuckets, Infinity];
  }

  restore(sample: BucketMetricSample): void {
    const key = getLabelKey(sample.labels);
    const data: HistogramData = {
      count: sample.count,
      sum: sample.sum,
      buckets: new Map(
        sample.buckets.map((b) => [b.le === '+Inf' ? Infinity : (b.le as number), b.count]),
      ),
    };
    this.values.set(key, data);
  }

  observe(value: number, labels?: MetricLabels): void {
    const key = getLabelKey(labels);
    let data = this.values.get(key);

    if (!data) {
      const buckets = new Map<number, number>();
      for (const bucket of this.buckets) {
        buckets.set(bucket, 0);
      }

      data = {
        count: 0,
        sum: 0,
        buckets,
      };
      this.values.set(key, data);
    }

    data.count++;
    data.sum += value;

    for (const bucket of this.buckets) {
      if (value <= bucket) {
        const currentCount = data.buckets.get(bucket)!;
        data.buckets.set(bucket, currentCount + 1);
      }
    }
  }

  collect(): CollectedMetric {
    const samples: BucketMetricSample[] = Array.from(this.values.entries()).map(([key, data]) => ({
      labels: parseLabelKey(key),
      count: data.count,
      sum: data.sum,
      buckets: Array.from(data.buckets.entries()).map(([le, count]) => ({
        le: le === Infinity ? '+Inf' : le,
        count,
      })),
    }));

    this.values.clear();

    return {
      name: this.opts.name,
      help: this.opts.help,
      type: 'histogram',
      samples,
    };
  }
}

export type MetricLabels = Record<string, string>;

export interface Counter {
  inc(value?: number, labels?: MetricLabels): void;
}

export interface Gauge {
  inc(value?: number, labels?: MetricLabels): void;
  dec(value?: number, labels?: MetricLabels): void;
  set(value: number, labels?: MetricLabels): void;
}

export interface Histogram {
  observe(value: number, labels?: MetricLabels): void;
  restore(sample: BucketMetricSample): void;
}

export interface ImpactMetricsDataSource {
  collect(): CollectedMetric[];
  restore(metrics: CollectedMetric[]): void;
}

export interface ImpactMetricRegistry {
  getCounter(counterName: string): Counter | undefined;
  getGauge(gaugeName: string): Gauge | undefined;
  getHistogram(histogramName: string): Histogram | undefined;
  counter(opts: MetricOptions): Counter;
  gauge(opts: MetricOptions): Gauge;
  histogram(opts: BucketMetricOptions): Histogram;
}

export class InMemoryMetricRegistry implements ImpactMetricsDataSource, ImpactMetricRegistry {
  private counters = new Map<string, Counter & CollectibleMetric>();

  private gauges = new Map<string, Gauge & CollectibleMetric>();

  private histograms = new Map<string, Histogram & CollectibleMetric>();

  getCounter(counterName: string): Counter | undefined {
    return this.counters.get(counterName);
  }

  getGauge(gaugeName: string): Gauge | undefined {
    return this.gauges.get(gaugeName);
  }

  getHistogram(histogramName: string): Histogram | undefined {
    return this.histograms.get(histogramName);
  }

  counter(opts: MetricOptions): Counter {
    const key = opts.name;
    if (!this.counters.has(key)) {
      this.counters.set(key, new CounterImpl(opts));
    }
    return this.counters.get(key)!;
  }

  gauge(opts: MetricOptions): Gauge {
    const key = opts.name;
    if (!this.gauges.has(key)) {
      this.gauges.set(key, new GaugeImpl(opts));
    }
    return this.gauges.get(key)!;
  }

  histogram(opts: BucketMetricOptions): Histogram {
    const key = opts.name;
    if (!this.histograms.has(key)) {
      this.histograms.set(key, new HistogramImpl(opts));
    }
    return this.histograms.get(key)!;
  }

  collect(): CollectedMetric[] {
    const allCounters = [...this.counters.values()].map((c) => c.collect());
    const allGauges = [...this.gauges.values()].map((g) => g.collect());
    const allHistograms = [...this.histograms.values()].map((h) => h.collect());
    const allMetrics = [...allCounters, ...allGauges, ...allHistograms];

    const nonEmpty = allMetrics.filter((metric) => metric.samples.length > 0);
    return nonEmpty.length > 0 ? nonEmpty : [];
  }

  restore(metrics: CollectedMetric[]): void {
    for (const metric of metrics) {
      switch (metric.type) {
        case 'counter': {
          const counter = this.counter({ name: metric.name, help: metric.help });
          for (const sample of metric.samples) {
            if (isNumericMetricSample(sample)) {
              counter.inc(sample.value, sample.labels);
            }
          }
          break;
        }

        case 'gauge': {
          const gauge = this.gauge({ name: metric.name, help: metric.help });
          for (const sample of metric.samples) {
            if (isNumericMetricSample(sample)) {
              gauge.set(sample.value, sample.labels);
            }
          }
          break;
        }

        case 'histogram': {
          const firstSample = metric.samples.find(isBucketMetricSample);
          if (firstSample) {
            const buckets = firstSample.buckets.map((b) =>
              b.le === '+Inf' ? Infinity : (b.le as number),
            );
            const histogram = this.histogram({
              name: metric.name,
              help: metric.help,
              buckets,
            });

            metric.samples.filter(isBucketMetricSample).forEach((sample) => {
              histogram.restore(sample);
            });
          }
          break;
        }
      }
    }
  }
}

export interface MetricOptions {
  name: string;
  help: string;
  labelNames?: string[];
}

export interface BucketMetricOptions extends MetricOptions {
  buckets: number[];
}

export interface MetricFlagContext {
  flagNames: string[];
  context: Context;
}
