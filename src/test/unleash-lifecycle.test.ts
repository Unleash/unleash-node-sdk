import { once } from 'node:events';
import type { ClientFeatures } from '@unleash/yggdrasil-engine';
import { describe, expect, test, vi } from 'vitest';
import InMemStorageProvider from '../repository/storage-provider-in-mem';
import { client, FakeFetcher, feature, state } from './fixtures';

test('evaluates full and delta updates from an injected fetcher', async () => {
  const fetcher = new FakeFetcher(state());
  const sdk = client({ fetcher });
  await sdk.start();
  expect(sdk.isSynchronized()).toBe(true);
  expect(sdk.isEnabled('feature')).toBe(true);
  expect(sdk.isEnabled('missing', {}, true)).toBe(true);
  expect(sdk.getFeatureToggleDefinitions().map(({ name, enabled }) => ({ name, enabled }))).toEqual(
    [{ name: 'feature', enabled: true }],
  );
  await fetcher.publish({
    events: [
      { type: 'feature-updated', eventId: 1, feature: feature('feature', { enabled: false }) },
    ],
  });
  expect(sdk.isEnabled('feature', {}, true)).toBe(false);
  await fetcher.publish({
    events: [{ type: 'feature-removed', eventId: 2, featureName: 'feature', project: 'default' }],
  });
  expect(sdk.isEnabled('feature', {}, true)).toBe(true);
  expect(sdk.getFeatureToggleDefinitions()).toEqual([]);
});

describe('variants and impressions', () => {
  test('returns engine payloads with both public feature status fields', async () => {
    const sdk = client({
      fetcher: new FakeFetcher(
        state([
          feature('experiment', {
            impressionData: true,
            variants: [
              { name: 'blue', weight: 1000, payload: { type: 'json', value: '{"color":"blue"}' } },
            ],
          }),
        ]),
      ),
    });
    const impression = vi.fn();
    sdk.on('impression', impression);
    await sdk.start();
    expect(sdk.getVariant('experiment', { userId: 'u' })).toEqual({
      name: 'blue',
      enabled: true,
      payload: { type: 'json', value: '{"color":"blue"}' },
      feature_enabled: true,
      featureEnabled: true,
    });
    expect(impression).toHaveBeenCalledWith({
      eventType: 'getVariant',
      featureName: 'experiment',
      enabled: true,
      variant: 'blue',
      context: { appName: 'sdk-test', environment: 'default', userId: 'u' },
    });
  });

  test.each([
    ['enabled without variants', feature('flag'), true],
    ['disabled', feature('flag', { enabled: false }), false],
    [
      'excluded by targeting',
      feature('flag', {
        strategies: [{ name: 'userWithId', parameters: { userIds: 'other' }, variants: undefined }],
      }),
      false,
    ],
  ] as const)(
    'applies a caller fallback for a flag that is %s',
    async (_description, flag, enabled) => {
      const sdk = client({ fetcher: new FakeFetcher(state([flag])) });
      await sdk.start();
      expect(sdk.getVariant('flag', { userId: 'u' }, { name: 'control', enabled: true })).toEqual({
        name: 'control',
        enabled: true,
        feature_enabled: enabled,
        featureEnabled: enabled,
      });
    },
  );

  test('does not emit impressions without opt-in', async () => {
    const sdk = client({ fetcher: new FakeFetcher(state()) });
    const impression = vi.fn();
    sdk.on('impression', impression);
    await sdk.start();
    sdk.isEnabled('feature');
    sdk.getVariant('feature');
    sdk.isEnabled('missing');
    sdk.getVariant('missing');
    expect(impression).not.toHaveBeenCalled();
  });

  test('isEnabled impressions contain the context actually evaluated', async () => {
    const sdk = client({
      environment: 'production',
      fetcher: new FakeFetcher(state([feature('flag', { impressionData: true })])),
    });
    const impression = vi.fn();
    sdk.on('impression', impression);
    await sdk.start();
    sdk.isEnabled('flag', { environment: 'preview' });
    expect(impression).toHaveBeenCalledWith({
      eventType: 'isEnabled',
      featureName: 'flag',
      enabled: true,
      context: { appName: 'sdk-test', environment: 'preview' },
    });
  });
});

test('bootstrap supplies ready, without changed, synchronization, or persistence', async () => {
  const storage = new InMemStorageProvider<ClientFeatures>();
  const save = vi.spyOn(storage, 'set');
  const sdk = client({ storageProvider: storage, bootstrap: { features: state() } });
  const ready = once(sdk, 'ready');
  const changed = vi.fn();
  const synchronized = vi.fn();
  sdk.on('changed', changed).on('synchronized', synchronized);
  await sdk.start();
  await ready;
  expect(sdk.isEnabled('feature')).toBe(true);
  expect(sdk.isSynchronized()).toBe(false);
  expect(changed).not.toHaveBeenCalled();
  expect(synchronized).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});

test('starts and destroys once, ignores late updates, and evaluates post-destroy fallbacks', async () => {
  const fetcher = new FakeFetcher(state());
  const sdk = client({ fetcher });
  await sdk.start();
  await sdk.start();
  expect(fetcher.starts).toBe(1);
  sdk.destroy();
  sdk.destroy();
  expect(fetcher.stops).toBe(1);
  await fetcher.publish(state([feature('late')]));
  await sdk.start();
  expect(fetcher.starts).toBe(1);
  expect(sdk.isEnabled('feature')).toBe(false);
  expect(sdk.isEnabled('feature', {}, true)).toBe(true);
  expect(sdk.getVariant('feature').feature_enabled).toBe(false);
  expect(sdk.getFeatureToggleDefinitions()).toEqual([]);
});
