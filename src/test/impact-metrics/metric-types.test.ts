import { expect, test } from 'vitest';
import { InMemoryMetricRegistry } from '../../impact-metrics/metric-types';

test('Counter increments by default value', () => {
  const registry = new InMemoryMetricRegistry();
  const counter = registry.counter({ name: 'test_counter', help: 'testing' });

  counter.inc();

  const result = registry.collect();
  const metric = result.find((m) => m.name === 'test_counter');

  expect(metric).toStrictEqual({
    name: 'test_counter',
    help: 'testing',
    type: 'counter',
    samples: [
      {
        labels: {},
        value: 1,
      },
    ],
  });
});

test('Counter increments with custom value and labels', () => {
  const registry = new InMemoryMetricRegistry();
  const counter = registry.counter({ name: 'labeled_counter', help: 'with labels' });

  counter.inc(3, { foo: 'bar' });
  counter.inc(2, { foo: 'bar' });

  const result = registry.collect();
  const metric = result.find((m) => m.name === 'labeled_counter');

  expect(metric).toStrictEqual({
    name: 'labeled_counter',
    help: 'with labels',
    type: 'counter',
    samples: [
      {
        labels: { foo: 'bar' },
        value: 5,
      },
    ],
  });
});

test('Gauge supports inc, dec, and set', () => {
  const registry = new InMemoryMetricRegistry();
  const gauge = registry.gauge({ name: 'test_gauge', help: 'gauge test' });

  gauge.inc(5, { env: 'prod' });
  gauge.dec(2, { env: 'prod' });
  gauge.set(10, { env: 'prod' });

  const result = registry.collect();
  const metric = result.find((m) => m.name === 'test_gauge');

  expect(metric).toStrictEqual({
    name: 'test_gauge',
    help: 'gauge test',
    type: 'gauge',
    samples: [
      {
        labels: { env: 'prod' },
        value: 10,
      },
    ],
  });
});

test('Different label combinations are stored separately', () => {
  const registry = new InMemoryMetricRegistry();
  const counter = registry.counter({ name: 'multi_label', help: 'label test' });

  counter.inc(1, { a: 'x' });
  counter.inc(2, { b: 'y' });
  counter.inc(3);

  const result = registry.collect();
  const metric = result.find((m) => m.name === 'multi_label');

  expect(metric).toStrictEqual({
    name: 'multi_label',
    help: 'label test',
    type: 'counter',
    samples: [
      { labels: { a: 'x' }, value: 1 },
      { labels: { b: 'y' }, value: 2 },
      { labels: {}, value: 3 },
    ],
  });
});

test('Gauge tracks values separately per label set', () => {
  const registry = new InMemoryMetricRegistry();
  const gauge = registry.gauge({ name: 'multi_env_gauge', help: 'tracks multiple envs' });

  gauge.inc(5, { env: 'prod' });
  gauge.dec(2, { env: 'dev' });
  gauge.set(10, { env: 'test' });

  const result = registry.collect();
  const metric = result.find((m) => m.name === 'multi_env_gauge');

  expect(metric).toStrictEqual({
    name: 'multi_env_gauge',
    help: 'tracks multiple envs',
    type: 'gauge',
    samples: [
      { labels: { env: 'prod' }, value: 5 },
      { labels: { env: 'dev' }, value: -2 },
      { labels: { env: 'test' }, value: 10 },
    ],
  });
});

test('collect returns counter with zero value when counter is empty', () => {
  const registry = new InMemoryMetricRegistry();
  registry.counter({ name: 'noop_counter', help: 'noop' });
  registry.gauge({ name: 'noop_gauge', help: 'noop' });

  const result = registry.collect();
  expect(result).toStrictEqual([
    {
      name: 'noop_counter',
      help: 'noop',
      type: 'counter',
      samples: [
        {
          labels: {},
          value: 0,
        },
      ],
    },
  ]);
});

test('collect returns counter with zero value after flushing previous values', () => {
  const registry = new InMemoryMetricRegistry();
  const counter = registry.counter({ name: 'flush_test', help: 'flush' });

  counter.inc(1);
  const first = registry.collect();
  expect(first).toBeTruthy();
  expect(first).toHaveLength(1);

  const second = registry.collect();
  expect(second).toStrictEqual([
    {
      name: 'flush_test',
      help: 'flush',
      type: 'counter',
      samples: [
        {
          labels: {},
          value: 0,
        },
      ],
    },
  ]);
});

test('restore reinserts collected metrics into the registry', () => {
  const registry = new InMemoryMetricRegistry();
  const counter = registry.counter({ name: 'restore_test', help: 'testing restore' });

  counter.inc(5, { tag: 'a' });
  counter.inc(2, { tag: 'b' });

  const flushed = registry.collect();
  expect(flushed).toHaveLength(1);

  const afterFlush = registry.collect();
  expect(afterFlush).toStrictEqual([
    {
      name: 'restore_test',
      help: 'testing restore',
      type: 'counter',
      samples: [
        {
          labels: {},
          value: 0,
        },
      ],
    },
  ]);

  registry.restore(flushed);

  const restored = registry.collect();
  expect(restored).toStrictEqual([
    {
      name: 'restore_test',
      help: 'testing restore',
      type: 'counter',
      samples: [
        { labels: { tag: 'a' }, value: 5 },
        { labels: { tag: 'b' }, value: 2 },
      ],
    },
  ]);
});

test('Histogram observes values', () => {
  const registry = new InMemoryMetricRegistry();
  const histogram = registry.histogram({
    name: 'test_histogram',
    help: 'testing histogram',
    buckets: [0.1, 0.5, 1, 2.5, 5],
  });

  histogram.observe(0.05, { env: 'prod' });
  histogram.observe(0.75, { env: 'prod' });
  histogram.observe(3, { env: 'prod' });

  const result = registry.collect();

  expect(result).toStrictEqual([
    {
      name: 'test_histogram',
      help: 'testing histogram',
      type: 'histogram',
      samples: [
        {
          labels: { env: 'prod' },
          count: 3,
          sum: 3.8,
          buckets: [
            { le: 0.1, count: 1 },
            { le: 0.5, count: 1 },
            { le: 1, count: 2 },
            { le: 2.5, count: 2 },
            { le: 5, count: 3 },
            { le: '+Inf', count: 3 },
          ],
        },
      ],
    },
  ]);
});

test('Histogram tracks different label combinations separately', () => {
  const registry = new InMemoryMetricRegistry();
  const histogram = registry.histogram({
    name: 'multi_label_histogram',
    help: 'histogram with multiple labels',
    buckets: [1, 10],
  });

  histogram.observe(0.5, { method: 'GET' });
  histogram.observe(5, { method: 'POST' });
  histogram.observe(15);

  const result = registry.collect();

  expect(result).toStrictEqual([
    {
      name: 'multi_label_histogram',
      help: 'histogram with multiple labels',
      type: 'histogram',
      samples: [
        {
          labels: { method: 'GET' },
          count: 1,
          sum: 0.5,
          buckets: [
            { le: 1, count: 1 },
            { le: 10, count: 1 },
            { le: '+Inf', count: 1 },
          ],
        },
        {
          labels: { method: 'POST' },
          count: 1,
          sum: 5,
          buckets: [
            { le: 1, count: 0 },
            { le: 10, count: 1 },
            { le: '+Inf', count: 1 },
          ],
        },
        {
          labels: {},
          count: 1,
          sum: 15,
          buckets: [
            { le: 1, count: 0 },
            { le: 10, count: 0 },
            { le: '+Inf', count: 1 },
          ],
        },
      ],
    },
  ]);
});

test('Histogram restoration preserves exact data', () => {
  const registry = new InMemoryMetricRegistry();
  const histogram = registry.histogram({
    name: 'restore_histogram',
    help: 'testing histogram restore',
    buckets: [0.1, 1, 10],
  });

  histogram.observe(0.05, { method: 'GET' });
  histogram.observe(0.5, { method: 'GET' });
  histogram.observe(5, { method: 'POST' });
  histogram.observe(15, { method: 'POST' });

  const firstCollect = registry.collect();
  expect(firstCollect).toHaveLength(1);

  const emptyCollect = registry.collect();
  expect(emptyCollect).toStrictEqual([
    {
      name: 'restore_histogram',
      help: 'testing histogram restore',
      type: 'histogram',
      samples: [
        {
          labels: {},
          count: 0,
          sum: 0,
          buckets: [
            { le: 0.1, count: 0 },
            { le: 1, count: 0 },
            { le: 10, count: 0 },
            { le: '+Inf', count: 0 },
          ],
        },
      ],
    },
  ]);

  registry.restore(firstCollect);

  const restoredCollect = registry.collect();
  expect(restoredCollect).toStrictEqual(firstCollect);
});

test.each([Infinity, -Infinity, NaN])('all metric operations silently drop %s', (invalid) => {
  const registry = new InMemoryMetricRegistry();
  const counter = registry.counter({ name: 'c', help: 'h' });
  const gauge = registry.gauge({ name: 'g', help: 'h' });
  const histogram = registry.histogram({ name: 'h', help: 'h', buckets: [1] });

  counter.inc(1);
  counter.inc(-1); // dropped
  counter.inc(invalid);
  gauge.set(5);
  gauge.set(invalid);
  gauge.inc(invalid);
  gauge.dec(invalid);
  histogram.observe(0.5);
  histogram.observe(invalid);

  const result = registry.collect();

  expect(result).toStrictEqual([
    { name: 'c', help: 'h', type: 'counter', samples: [{ labels: {}, value: 1 }] },
    { name: 'g', help: 'h', type: 'gauge', samples: [{ labels: {}, value: 5 }] },
    {
      name: 'h',
      help: 'h',
      type: 'histogram',
      samples: [
        {
          labels: {},
          count: 1,
          sum: 0.5,
          buckets: [
            { le: 1, count: 1 },
            { le: '+Inf', count: 1 },
          ],
        },
      ],
    },
  ]);
});
