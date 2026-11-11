import type { UnleashEngine } from '@unleash/yggdrasil-engine';
import { expect, test } from 'vitest';
import { MetricsAPI } from '../../impact-metrics/metric-api';

test('should not register a counter with empty name or help', () => {
  let counterRegistered = false;

  const fakeRegistry = {
    defineCounter: () => {
      counterRegistered = true;
    },
  } as unknown as UnleashEngine;

  const api = new MetricsAPI(fakeRegistry);

  api.defineCounter('some_name', '');
  expect(counterRegistered, 'Counter should not be registered with empty help').toBe(false);

  api.defineCounter('', 'some_help');
  expect(counterRegistered, 'Counter should not be registered with empty name').toBe(false);
});

test('should register a counter with valid name and help', () => {
  let counterRegistered = false;

  const fakeRegistry = {
    defineCounter: () => {
      counterRegistered = true;
    },
  } as unknown as UnleashEngine;

  const api = new MetricsAPI(fakeRegistry);

  api.defineCounter('valid_name', 'Valid help text');
  expect(counterRegistered, 'Counter should be registered with valid name and help').toBe(true);
});

test('should not register a gauge with empty name or help', () => {
  let gaugeRegistered = false;

  const fakeRegistry = {
    defineGauge: () => {
      gaugeRegistered = true;
    },
  } as unknown as UnleashEngine;

  const api = new MetricsAPI(fakeRegistry);

  api.defineGauge('some_name', '');
  expect(gaugeRegistered, 'Gauge should not be registered with empty help').toBe(false);

  api.defineGauge('', 'some_help');
  expect(gaugeRegistered, 'Gauge should not be registered with empty name').toBe(false);
});

test('should register a gauge with valid name and help', () => {
  let gaugeRegistered = false;

  const fakeRegistry = {
    defineGauge: () => {
      gaugeRegistered = true;
    },
  } as unknown as UnleashEngine;

  const api = new MetricsAPI(fakeRegistry);

  api.defineGauge('valid_name', 'Valid help text');
  expect(gaugeRegistered, 'Gauge should be registered with valid name and help').toBe(true);
});

test('should increment counter with valid parameters', () => {
  const calls: [string, number][] = [];
  const fakeRegistry = {
    incrementCounter: (name: string, value: number) => calls.push([name, value]),
  } as unknown as UnleashEngine;
  const api = new MetricsAPI(fakeRegistry);
  api.incrementCounter('valid_counter', 5);
  api.incrementCounter('valid_counter', 5);

  expect(calls).toStrictEqual([
    ['valid_counter', 5],
    ['valid_counter', 5],
  ]);
});

test('should set gauge with valid parameters', () => {
  let gaugeSet = false;
  let recordedValue = 0;

  const fakeRegistry = {
    updateGauge: (_name: string, value: number) => {
      gaugeSet = true;
      recordedValue = value;
    },
  } as unknown as UnleashEngine;
  const api = new MetricsAPI(fakeRegistry);
  api.updateGauge('valid_gauge', 10);
  expect(gaugeSet, 'Gauge should be set with valid parameters').toBe(true);
  expect(recordedValue).toBe(10);
});

test('should not register a histogram with empty name or help', () => {
  let histogramRegistered = false;

  const fakeRegistry = {
    defineHistogram: () => {
      histogramRegistered = true;
    },
  } as unknown as UnleashEngine;

  const api = new MetricsAPI(fakeRegistry);

  api.defineHistogram('some_name', '');
  expect(histogramRegistered, 'Histogram should not be registered with empty help').toBe(false);

  api.defineHistogram('', 'some_help');
  expect(histogramRegistered, 'Histogram should not be registered with empty name').toBe(false);
});

test('should register a histogram with valid name and help', () => {
  let histogramRegistered = false;

  const fakeRegistry = {
    defineHistogram: () => {
      histogramRegistered = true;
    },
  } as unknown as UnleashEngine;

  const api = new MetricsAPI(fakeRegistry);

  api.defineHistogram('valid_name', 'Valid help text');
  expect(histogramRegistered, 'Histogram should be registered with valid name and help').toBe(true);
});

test('should observe histogram with valid parameters', () => {
  let histogramObserved = false;
  let recordedValue = 0;

  const fakeRegistry = {
    observeHistogram: (_name: string, value: number) => {
      histogramObserved = true;
      recordedValue = value;
    },
  } as unknown as UnleashEngine;
  const api = new MetricsAPI(fakeRegistry);
  api.observeHistogram('valid_histogram', 1.5);
  expect(histogramObserved, 'Histogram should be observed with valid parameters').toBe(true);
  expect(recordedValue).toBe(1.5);
});
