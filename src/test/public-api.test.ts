import type { ClientFeatures } from '@unleash/yggdrasil-engine';
import { afterEach, expect, test } from 'vitest';
import * as api from '../index';
import { FakeFetcher, state } from './fixtures';

afterEach(() => api.destroy());

test('exports the supported runtime API and removes obsolete methods/classes', () => {
  for (const name of [
    'initialize',
    'startUnleash',
    'isEnabled',
    'getVariant',
    'getFeatureToggleDefinitions',
    'flushMetrics',
    'destroy',
    'destroyWithFlush',
    'Unleash',
    'PayloadType',
    'UnleashEvents',
    'InMemStorageProvider',
    'UnleashMetricClient',
  ]) {
    expect(api).toHaveProperty(name);
  }
  for (const name of [
    'count',
    'countVariant',
    'forceGetVariant',
    'getFeatureToggleDefinition',
    'Strategy',
  ]) {
    expect(api).not.toHaveProperty(name);
  }
});

test('returns defaults without a singleton', () => {
  expect(api.isEnabled('feature')).toBe(false);
  expect(api.isEnabled('feature', {}, true)).toBe(true);
  expect(api.getFeatureToggleDefinitions()).toEqual([]);
  expect(api.getVariant('feature')).toEqual({
    name: 'disabled',
    enabled: false,
    feature_enabled: false,
  });
  expect(api.getVariant('feature', {}, { name: 'control', enabled: true })).toEqual({
    name: 'control',
    enabled: true,
  });
});

test('startUnleash waits for a live update and reuses an already synchronized singleton', async () => {
  const fetcher = new FakeFetcher();
  const options = {
    appName: 'singleton',
    url: 'http://unleash.test/api/',
    fetcher,
    disableMetrics: true,
    storageProvider: new api.InMemStorageProvider<ClientFeatures>(),
    bootstrap: { features: state() },
  };
  let settled = false;
  const started = api.startUnleash(options).then((sdk) => {
    settled = true;
    return sdk;
  });
  const instance = api.initialize(options);
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(settled).toBe(false);
  expect(instance.isEnabled('feature')).toBe(true);
  expect(instance.isSynchronized()).toBe(false);
  await fetcher.publish(state());
  expect(await started).toBe(instance);
  expect(await api.startUnleash(options)).toBe(instance);
  expect(api.isEnabled('feature')).toBe(true);
  expect(api.getFeatureToggleDefinitions()).toEqual([
    { name: 'feature', enabled: true, project: 'default' },
  ]);
});
