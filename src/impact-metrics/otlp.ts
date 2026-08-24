import type { BucketMetricSample, CollectedMetric, MetricLabels } from './metric-types';

// OTLP/JSON (ExportMetricsServiceRequest) — only the fields we read.
interface OtlpAttribute {
  key: string;
  value: {
    stringValue?: string;
    intValue?: string | number;
    doubleValue?: number;
    boolValue?: boolean;
  };
}
interface OtlpNumberPoint {
  attributes?: OtlpAttribute[];
  asDouble?: number;
  asInt?: string | number;
}
interface OtlpHistogramPoint {
  attributes?: OtlpAttribute[];
  count: string | number;
  sum?: number;
  bucketCounts: Array<string | number>;
  explicitBounds: number[];
}
interface OtlpMetric {
  name: string;
  description?: string;
  sum?: { dataPoints: OtlpNumberPoint[]; isMonotonic?: boolean; aggregationTemporality?: number };
  gauge?: { dataPoints: OtlpNumberPoint[] };
  histogram?: { dataPoints: OtlpHistogramPoint[]; aggregationTemporality?: number };
}
export interface OtlpMetricsRequest {
  resourceMetrics?: Array<{ scopeMetrics?: Array<{ metrics?: OtlpMetric[] }> }>;
}

export interface OtlpOptions {
  // Attribute keys kept as labels; everything else is dropped (cardinality guard).
  labels: string[];
}

const AGGREGATION_TEMPORALITY_DELTA = 1;

const num = (v: string | number | undefined): number => (v === undefined ? 0 : Number(v));

const toLabels = (attributes: OtlpAttribute[] | undefined, keep: string[]): MetricLabels => {
  const labels: MetricLabels = {};
  for (const { key, value } of attributes ?? []) {
    if (!keep.includes(key)) continue;
    const v = value.stringValue ?? value.intValue ?? value.doubleValue ?? value.boolValue;
    if (v !== undefined) labels[key.replace(/[^a-zA-Z0-9_]/g, '_')] = String(v);
  }
  return labels;
};

const toHistogramSample = (point: OtlpHistogramPoint, keep: string[]): BucketMetricSample => {
  const buckets: BucketMetricSample['buckets'] = [];
  let cumulative = 0;
  point.bucketCounts.forEach((count, i) => {
    cumulative += num(count);
    buckets.push({
      le: i < point.explicitBounds.length ? point.explicitBounds[i] : '+Inf',
      count: cumulative,
    });
  });
  return {
    labels: toLabels(point.attributes, keep),
    count: num(point.count),
    sum: point.sum ?? 0,
    buckets,
  };
};

// Impact metrics are deltas, so cumulative OTLP series are skipped rather than double counted.
// Exporters pick delta via OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta.
export function otlpToImpactMetrics(
  request: OtlpMetricsRequest,
  options: OtlpOptions,
): CollectedMetric[] {
  const out: CollectedMetric[] = [];
  const keep = options.labels;
  for (const rm of request.resourceMetrics ?? []) {
    for (const sm of rm.scopeMetrics ?? []) {
      for (const metric of sm.metrics ?? []) {
        const name = metric.name.replace(/[^a-zA-Z0-9_]/g, '_');
        const help = metric.description || metric.name;
        if (metric.sum) {
          if (
            metric.sum.isMonotonic &&
            metric.sum.aggregationTemporality !== AGGREGATION_TEMPORALITY_DELTA
          )
            continue;
          out.push({
            name,
            help,
            type: metric.sum.isMonotonic ? 'counter' : 'gauge',
            samples: metric.sum.dataPoints.map((p) => ({
              labels: toLabels(p.attributes, keep),
              value: p.asDouble ?? num(p.asInt),
            })),
          });
        } else if (metric.gauge) {
          out.push({
            name,
            help,
            type: 'gauge',
            samples: metric.gauge.dataPoints.map((p) => ({
              labels: toLabels(p.attributes, keep),
              value: p.asDouble ?? num(p.asInt),
            })),
          });
        } else if (metric.histogram) {
          if (metric.histogram.aggregationTemporality !== AGGREGATION_TEMPORALITY_DELTA) continue;
          out.push({
            name,
            help,
            type: 'histogram',
            samples: metric.histogram.dataPoints.map((p) => toHistogramSample(p, keep)),
          });
        }
      }
    }
  }
  return out.filter((m) => m.samples.length > 0);
}
