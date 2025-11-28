import nock from 'nock';
import { expect, test } from 'vitest';
import {
  count,
  countVariant,
  destroy,
  getFeatureToggleDefinition,
  getFeatureToggleDefinitions,
  getVariant,
  initialize,
  isEnabled,
  Strategy,
  startUnleash,
} from '../index';

let counter = 1;
const getUrl = () => {
  const url = `http://test${counter}.app/`;
  counter += 1;
  return url;
};
const metricsUrl = '/client/metrics';
const nockMetrics = (url: string, code = 200) => nock(url).post(metricsUrl).reply(code, '');
const registerUrl = '/client/register';
const nockRegister = (url: string, code = 200) => nock(url).post(registerUrl).reply(code, '');
const nockFeatures = (url: string, code = 200) =>
  nock(url).get('/client/features').reply(code, { features: [] });

test('should load main module', (t) => {
  expect(initialize).toBeTruthy();
  expect(startUnleash).toBeTruthy();
  expect(isEnabled).toBeTruthy();
  expect(Strategy).toBeTruthy();
  expect(destroy).toBeTruthy();
  expect(countVariant).toBeTruthy();
  expect(getVariant).toBeTruthy();
  expect(getFeatureToggleDefinition).toBeTruthy();
  expect(getFeatureToggleDefinitions).toBeTruthy();
  expect(count).toBeTruthy();
});

test('initialize should init with valid options', (t) => {
  const url = getUrl();
  nockMetrics(url);
  nockRegister(url);
  expect(() => initialize({ appName: 'my-app-name', url })).not.toThrow();
  destroy();
});

test('should call methods', (t) => {
  const url = getUrl();
  nockMetrics(url);
  nockRegister(url);
  expect(() => initialize({ appName: 'my-app-name', url })).not.toThrow();
  expect(isEnabled('some-feature')).toMatchSnapshot();
  expect(getFeatureToggleDefinition('some-feature')).toMatchSnapshot();
  expect(getVariant('some-feature')).toMatchSnapshot();
  destroy();
});

test('should not return feature-toggle definition if there is no instance', (t) => {
  // @ts-expect-error
  expect(getFeatureToggleDefinition()).toBeUndefined();
});

test.sequential('should start unleash with promise', async (t) => {
  const url = getUrl();
  nockFeatures(url);
  nockMetrics(url);
  nockRegister(url);
  const unleash = await startUnleash({ appName: 'my-app-name', url });
  expect(unleash).toBeTruthy();
  destroy();
});

test.sequential('should start unleash with promise multiple times', async (t) => {
  const url = getUrl();
  nockFeatures(url);
  nockMetrics(url);
  nockRegister(url);
  const config = { appName: 'my-app-name', url };
  const unleash1 = await startUnleash(config);
  expect(unleash1).toBeTruthy();
  const unleash2 = await startUnleash(config);
  expect(unleash2).toBeTruthy();
  destroy();
});
