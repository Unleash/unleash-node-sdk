import test from 'ava';
import type Client from '../../client';
import { MetricsAPI } from '../../impact-metrics/metric-api';
import type {
  BucketMetricOptions,
  Counter,
  Gauge,
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
  t.false(counterRegistered, 'Counter should not be registered with empty help');

  api.defineCounter('', 'some_help');
  t.false(counterRegistered, 'Counter should not be registered with empty name');
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
  t.true(counterRegistered, 'Counter should be registered with valid name and help');
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
  t.false(gaugeRegistered, 'Gauge should not be registered with empty help');

  api.defineGauge('', 'some_help');
  t.false(gaugeRegistered, 'Gauge should not be registered with empty name');
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
  t.true(gaugeRegistered, 'Gauge should be registered with valid name and help');
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
  t.true(counterIncremented, 'Counter should be incremented with valid parameters');
  t.deepEqual(recordedLabels, { appName: 'my-app', environment: 'dev', featureX: 'enabled' });
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
  t.true(gaugeSet, 'Gauge should be set with valid parameters');
  t.deepEqual(recordedLabels, { appName: 'my-app', environment: 'dev', featureY: 'variantY' });
});

test('defining a counter automatically sets label names', (t) => {
  let counterRegistered = false;

  const fakeRegistry = {
    counter: (config: MetricOptions) => {
      counterRegistered = true;
      t.deepEqual(
        config.labelNames,
        ['featureName', 'appName', 'environment'],
        'Label names should be set correctly',
      );
    },
  } as unknown as ImpactMetricRegistry;

  const staticContext = { appName: 'my-app', environment: 'dev' };
  const api = new MetricsAPI(fakeRegistry, fakeVariantResolver(), staticContext);

  api.defineCounter('test_counter', 'Test help text');
  t.true(counterRegistered, 'Counter should be registered');
});

test('defining a gauge automatically sets label names', (t) => {
  let gaugeRegistered = false;

  const fakeRegistry = {
    gauge: (config: MetricOptions) => {
      gaugeRegistered = true;
      t.deepEqual(
        config.labelNames,
        ['featureName', 'appName', 'environment'],
        'Label names should be set correctly',
      );
    },
  } as unknown as ImpactMetricRegistry;

  const staticContext = { appName: 'my-app', environment: 'dev' };
  const api = new MetricsAPI(fakeRegistry, fakeVariantResolver('variantX'), staticContext);

  api.defineGauge('test_gauge', 'Test help text');
  t.true(gaugeRegistered, 'Gauge should be registered');
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
  t.false(histogramRegistered, 'Histogram should not be registered with empty help');

  api.defineHistogram('', 'some_help');
  t.false(histogramRegistered, 'Histogram should not be registered with empty name');
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
  t.true(histogramRegistered, 'Histogram should be registered with valid name and help');
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
  t.true(histogramObserved, 'Histogram should be observed with valid parameters');
  t.deepEqual(recordedLabels, { appName: 'my-app', environment: 'dev', featureX: 'enabled' });
});

test('defining a histogram automatically sets label names', (t) => {
  let histogramRegistered = false;

  const fakeRegistry = {
    histogram: (config: BucketMetricOptions) => {
      histogramRegistered = true;
      t.deepEqual(
        config.labelNames,
        ['featureName', 'appName', 'environment'],
        'Label names should be set correctly',
      );
    },
  } as unknown as ImpactMetricRegistry;

  const staticContext = { appName: 'my-app', environment: 'dev' };
  const api = new MetricsAPI(fakeRegistry, fakeVariantResolver(), staticContext);

  api.defineHistogram('test_histogram', 'Test help text');
  t.true(histogramRegistered, 'Histogram should be registered');
});
