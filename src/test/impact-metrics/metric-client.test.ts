import { expect, test } from 'vitest';
import type Client from '../../client';
import { MetricsAPI } from '../../impact-metrics/metric-api';
import type {
  BucketMetricOptions,
  ImpactMetricRegistry,
  MetricLabels,
  MetricOptions,
} from '../../impact-metrics/metric-types';

const fakeVariantResolver = (
  variantName = 'disabled',
  feature_enabled = true,
): Pick<Client, 'forceGetVariant'> => ({
  forceGetVariant: () => ({
    name: variantName,
    feature_enabled,
    enabled: variantName !== 'disabled',
    featureEnabled: feature_enabled,
  }),
});

test('should not register a counter with empty name or help', (t) => {
  let counterRegistered = false;

  const fakeRegistry = {
    counter: () => {
      counterRegistered = true;
    },
  } as unknown as ImpactMetricRegistry;

  const staticContext = { appName: 'my-app', environment: 'dev' };
  const api = new MetricsAPI(fakeRegistry, fakeVariantResolver(), staticContext);

  api.defineCounter('some_name', '');
  expect(counterRegistered, 'Counter should not be registered with empty help').toBe(false);

  api.defineCounter('', 'some_help');
  expect(counterRegistered, 'Counter should not be registered with empty name').toBe(false);
});

test('should register a counter with valid name and help', (t) => {
  let counterRegistered = false;

  const fakeRegistry = {
    counter: () => {
      counterRegistered = true;
    },
  } as unknown as ImpactMetricRegistry;

  const staticContext = { appName: 'my-app', environment: 'dev' };
  const api = new MetricsAPI(fakeRegistry, fakeVariantResolver(), staticContext);

  api.defineCounter('valid_name', 'Valid help text');
  expect(counterRegistered, 'Counter should be registered with valid name and help').toBe(true);
});

test('should not register a gauge with empty name or help', (t) => {
  let gaugeRegistered = false;

  const fakeRegistry = {
    gauge: () => {
      gaugeRegistered = true;
    },
  } as unknown as ImpactMetricRegistry;

  const staticContext = { appName: 'my-app', environment: 'dev' };
  const api = new MetricsAPI(fakeRegistry, fakeVariantResolver(), staticContext);

  api.defineGauge('some_name', '');
  expect(gaugeRegistered, 'Gauge should not be registered with empty help').toBe(false);

  api.defineGauge('', 'some_help');
  expect(gaugeRegistered, 'Gauge should not be registered with empty name').toBe(false);
});

test('should register a gauge with valid name and help', (t) => {
  let gaugeRegistered = false;

  const fakeRegistry = {
    gauge: () => {
      gaugeRegistered = true;
    },
  } as unknown as ImpactMetricRegistry;

  const staticContext = { appName: 'my-app', environment: 'dev' };
  const api = new MetricsAPI(fakeRegistry, fakeVariantResolver(), staticContext);

  api.defineGauge('valid_name', 'Valid help text');
  expect(gaugeRegistered, 'Gauge should be registered with valid name and help').toBe(true);
});

test('should increment counter with valid parameters', (t) => {
  let counterIncremented = false;
  let recordedLabels: MetricLabels = {};

  const fakeCounter = {
    inc: (_value: number, labels: MetricLabels) => {
      counterIncremented = true;
      recordedLabels = labels;
    },
  };

  const fakeRegistry = {
    getCounter: () => fakeCounter,
  } as unknown as ImpactMetricRegistry;

  const staticContext = { appName: 'my-app', environment: 'dev' };
  const api = new MetricsAPI(fakeRegistry, fakeVariantResolver(), staticContext);

  api.incrementCounter('valid_counter', 5, { flagNames: ['featureX'], context: staticContext });
  expect(counterIncremented, 'Counter should be incremented with valid parameters').toBe(true);
  expect(recordedLabels).toStrictEqual({
    appName: 'my-app',
    environment: 'dev',
    featureX: 'enabled',
  });
});

test('should set gauge with valid parameters', (t) => {
  let gaugeSet = false;
  let recordedLabels: MetricLabels = {};

  const fakeGauge = {
    set: (_value: number, labels: MetricLabels) => {
      gaugeSet = true;
      recordedLabels = labels;
    },
  };

  const fakeRegistry = {
    getGauge: () => fakeGauge,
  } as unknown as ImpactMetricRegistry;

  const staticContext = { appName: 'my-app', environment: 'dev' };
  const api = new MetricsAPI(fakeRegistry, fakeVariantResolver('variantY'), staticContext);

  api.updateGauge('valid_gauge', 10, { flagNames: ['featureY'], context: staticContext });
  expect(gaugeSet, 'Gauge should be set with valid parameters').toBe(true);
  expect(recordedLabels).toStrictEqual({
    appName: 'my-app',
    environment: 'dev',
    featureY: 'variantY',
  });
});

test('defining a counter automatically sets label names', (t) => {
  let counterRegistered = false;

  const fakeRegistry = {
    counter: (config: MetricOptions) => {
      counterRegistered = true;
      expect(config.labelNames, 'Label names should be set correctly').toStrictEqual([
        'featureName',
        'appName',
        'environment',
      ]);
    },
  } as unknown as ImpactMetricRegistry;

  const staticContext = { appName: 'my-app', environment: 'dev' };
  const api = new MetricsAPI(fakeRegistry, fakeVariantResolver(), staticContext);

  api.defineCounter('test_counter', 'Test help text');
  expect(counterRegistered, 'Counter should be registered').toBe(true);
});

test('defining a gauge automatically sets label names', (t) => {
  let gaugeRegistered = false;

  const fakeRegistry = {
    gauge: (config: MetricOptions) => {
      gaugeRegistered = true;
      expect(config.labelNames, 'Label names should be set correctly').toStrictEqual([
        'featureName',
        'appName',
        'environment',
      ]);
    },
  } as unknown as ImpactMetricRegistry;

  const staticContext = { appName: 'my-app', environment: 'dev' };
  const api = new MetricsAPI(fakeRegistry, fakeVariantResolver('variantX'), staticContext);

  api.defineGauge('test_gauge', 'Test help text');
  expect(gaugeRegistered, 'Gauge should be registered').toBe(true);
});

test('should not register a histogram with empty name or help', (t) => {
  let histogramRegistered = false;

  const fakeRegistry = {
    histogram: () => {
      histogramRegistered = true;
    },
  } as unknown as ImpactMetricRegistry;

  const staticContext = { appName: 'my-app', environment: 'dev' };
  const api = new MetricsAPI(fakeRegistry, fakeVariantResolver(), staticContext);

  api.defineHistogram('some_name', '');
  expect(histogramRegistered, 'Histogram should not be registered with empty help');

  api.defineHistogram('', 'some_help');
  expect(histogramRegistered, 'Histogram should not be registered with empty name');
});

test('should register a histogram with valid name and help', (t) => {
  let histogramRegistered = false;

  const fakeRegistry = {
    histogram: () => {
      histogramRegistered = true;
    },
  } as unknown as ImpactMetricRegistry;

  const staticContext = { appName: 'my-app', environment: 'dev' };
  const api = new MetricsAPI(fakeRegistry, fakeVariantResolver(), staticContext);

  api.defineHistogram('valid_name', 'Valid help text');
  expect(histogramRegistered, 'Histogram should be registered with valid name and help').toBe(true);
});

test('should observe histogram with valid parameters', (t) => {
  let histogramObserved = false;
  let recordedLabels: MetricLabels = {};

  const fakeHistogram = {
    observe: (_value: number, labels: MetricLabels) => {
      histogramObserved = true;
      recordedLabels = labels;
    },
  };

  const fakeRegistry = {
    getHistogram: () => fakeHistogram,
  } as unknown as ImpactMetricRegistry;

  const staticContext = { appName: 'my-app', environment: 'dev' };
  const api = new MetricsAPI(fakeRegistry, fakeVariantResolver(), staticContext);

  api.observeHistogram('valid_histogram', 1.5, { flagNames: ['featureX'], context: staticContext });
  expect(histogramObserved, 'Histogram should be observed with valid parameters').toBe(true);
  expect(recordedLabels).toStrictEqual({
    appName: 'my-app',
    environment: 'dev',
    featureX: 'enabled',
  });
});

test('defining a histogram automatically sets label names', (t) => {
  let histogramRegistered = false;

  const fakeRegistry = {
    histogram: (config: BucketMetricOptions) => {
      histogramRegistered = true;
      expect(config.labelNames, 'Label names should be set correctly').toStrictEqual([
        'featureName',
        'appName',
        'environment',
      ]);
    },
  } as unknown as ImpactMetricRegistry;

  const staticContext = { appName: 'my-app', environment: 'dev' };
  const api = new MetricsAPI(fakeRegistry, fakeVariantResolver(), staticContext);

  api.defineHistogram('test_histogram', 'Test help text');
  expect(histogramRegistered, 'Histogram should be registered').toBe(true);
});
