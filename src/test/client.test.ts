// @ts-nocheck
import { expect, test } from 'vitest';
import { client as createClient, FakeFetcher, state } from './fixtures';

async function loadClient(feature, strategies = []) {
  const sdk = createClient({
    strategies,
    fetcher: new FakeFetcher(state(feature ? [feature] : [])),
  });
  await sdk.start();
  return sdk;
}

import { UnleashEvents } from '../events';
import CustomFalseStrategy from './false_custom_strategy';
import CustomStrategy from './true_custom_strategy';

function buildToggle(name, active, strategies, variants = [], impressionData = false) {
  return {
    name,
    enabled: active,
    strategies: strategies || [{ name: 'default' }],
    variants,
    impressionData,
  };
}

const log = (err) => {
  console.error(err);
};

test('invalid strategy should throw', async () => {
  expect(() => createClient({ strategies: [true, null] })).toThrow();
  expect(() => createClient({ strategies: [{}] })).toThrow();
  expect(() => createClient({ strategies: [{ name: 'invalid' }] })).toThrow();
  expect(() => createClient({ strategies: [{ isEnabled: 'invalid' }] })).toThrow();
  expect(() =>
    createClient({
      strategies: [
        {
          name: 'valid',
          isEnabled: () => {},
        },
        null,
      ],
    }),
  ).toThrow();
});

test('should evaluate the fetched feature', async () => {
  const feature = buildToggle('feature', true);
  const client = await loadClient(feature, []);
  client.on('error', log).on('warn', log);
  const result = client.isEnabled('feature');

  expect(result).toBe(true);
});

test('should fallback when missing feature', async () => {
  const feature = null;
  const client = await loadClient(feature, []);
  client.on('error', log).on('warn', log);

  const result = client.isEnabled('feature-x', {}, () => false);
  expect(result).toBe(false);

  const result2 = client.isEnabled('feature-x', {}, () => true);
  expect(result2).toBe(true);
});

test('should consider toggle not active', async () => {
  const feature = buildToggle('feature', false);
  const client = await loadClient(feature, []);
  client.on('error', log).on('warn', log);
  const result = client.isEnabled('feature');

  expect(result).toBe(false);
});

test('should use custom strategy', async () => {
  const feature = buildToggle('feature', true, [{ name: 'custom' }]);
  const client = await loadClient(feature, [new CustomStrategy()]);
  client.on('error', log).on('warn', log);
  const result = client.isEnabled('feature');

  expect(result).toBe(true);
});

test('should use a set of custom strategies', async () => {
  const feature = buildToggle('feature', true, [{ name: 'custom' }, { name: 'custom-false' }]);

  const strategies = [new CustomFalseStrategy(), new CustomStrategy()];
  const client = await loadClient(feature, strategies);
  client.on('error', log).on('warn', log);
  const result = client.isEnabled('feature');

  expect(result).toBe(true);
});

test('should return false a set of custom-false strategies', async () => {
  const feature = buildToggle('feature', true, [
    { name: 'custom-false' },
    { name: 'custom-false' },
  ]);

  const strategies = [new CustomFalseStrategy(), new CustomStrategy()];
  const client = await loadClient(feature, strategies);
  client.on('error', log).on('warn', log);
  const result = client.isEnabled('feature');

  expect(result).toBe(false);
});

[
  [
    ['y', 1],
    ['0', 1],
    ['1', 1],
  ],
  [
    ['3', 33],
    ['2', 33],
    ['0', 33],
  ],
  [
    ['aaa', 100],
    ['3', 100],
    ['1', 100],
  ],
].forEach(([[id1, weight1], [id2, weight2], [id3, weight3]]) => {
  test(`should return variant when equal weight on ${weight1},${weight2},${weight3}`, async () => {
    const feature = buildToggle('feature', true, null, [
      {
        name: 'variant1',
        weight: weight1,
        payload: {
          type: 'string',
          value: 'val1',
        },
      },
      {
        name: 'variant2',
        weight: weight2,
        payload: {
          type: 'string',
          value: 'val2',
        },
      },
      {
        name: 'variant3',
        weight: weight3,
        payload: {
          type: 'string',
          value: 'val3',
        },
      },
    ]);

    const strategies = [];
    const client = await loadClient(feature, strategies);
    client.on('error', log).on('warn', log);
    const result = client.isEnabled('feature');

    expect(result).toBe(true);

    [id1, id2, id3].forEach((id) => {
      expect(client.getVariant('feature', { userId: id })).toMatchSnapshot();
    });
  });
});

test('should always return defaultVariant if missing variant', async () => {
  const feature = buildToggle('feature-but-no-variant', true, []);

  const client = await loadClient(feature);

  client.on('error', log).on('warn', log);
  const result = client.getVariant('feature-but-no-variant', {});
  const defaultVariant = {
    enabled: false,
    name: 'disabled',
    feature_enabled: true,
    featureEnabled: true,
  };
  expect(result).toEqual(defaultVariant);

  const fallback = {
    enabled: false,
    name: 'customDisabled',
    payload: {
      type: 'string',
      value: '',
    },
    feature_enabled: true,
    featureEnabled: true,
  };
  const result2 = client.getVariant('feature-but-no-variant', {}, fallback);

  expect(result2).toEqual(fallback);

  const result3 = client.getVariant('missing-feature-x', {});
  expect(result3).toEqual({ ...defaultVariant, feature_enabled: false, featureEnabled: false });
});

test('should not trigger events if impressionData is false', async () => {
  let called = false;
  const feature = buildToggle('feature-x', false, undefined, undefined, false);
  const client = await loadClient(feature, []);
  client.on(UnleashEvents.Impression, () => {
    called = true;
  });

  client.isEnabled('feature-x', {}, () => false);
  client.getVariant('feature-x', {});
  expect(called).toBe(false);
});

test('should trigger events on isEnabled if impressionData is true', async () => {
  let called = false;
  const feature = buildToggle('feature-x', false, undefined, undefined, true);
  const client = await loadClient(feature, []);
  client.on(UnleashEvents.Impression, () => {
    called = true;
  });
  client.isEnabled('feature-x', {}, () => false);
  expect(called).toBe(true);
});

test('should trigger events on unsatisfied dependency', async () => {
  let impressionCount = 0;
  const recordedWarnings = [];
  const feature = {
    name: 'feature-x',
    enabled: true,
    dependencies: [{ feature: 'not-feature-x' }],
    strategies: [{ name: 'default' }],
    variants: [],
    impressionData: true,
  };
  const client = await loadClient(feature, []);
  client
    .on(UnleashEvents.Impression, () => {
      impressionCount++;
    })
    .on(UnleashEvents.Warn, (warning) => {
      recordedWarnings.push(warning);
    });
  client.isEnabled('feature-x', {}, () => false);
  client.isEnabled('feature-x', {}, () => false);
  expect(impressionCount).toEqual(2);
  // Engine evaluation of a missing dependency is silent.
  expect(recordedWarnings).toEqual([]);
});

test('should trigger events on getVariant if impressionData is true', async () => {
  let called = false;
  const feature = buildToggle('feature-x', false, undefined, undefined, true);
  const client = await loadClient(feature, []);
  client.on(UnleashEvents.Impression, () => {
    called = true;
  });
  client.getVariant('feature-x', {});
  expect(called).toBe(true);
});

test('should favor strategy variant over feature variant', async () => {
  const feature = buildToggle(
    'feature-x',
    true,
    [
      {
        name: 'default',
        constraints: [],
        variants: [
          {
            name: 'strategyVariantName',
            payload: { type: 'string', value: 'strategyVariantValue' },
            weight: 1000,
          },
        ],
        parameters: {},
      },
    ],
    [
      {
        name: 'willBeIgnored',
        weight: 100,
        payload: {
          type: 'string',
          value: 'willBeIgnored',
        },
      },
    ],
    true,
  );
  const client = await loadClient(feature, []);
  const enabled = client.isEnabled('feature-x', {}, () => false);
  const variant = client.getVariant('feature-x', {});
  expect(enabled).toBe(true);
  expect(variant).toStrictEqual({
    name: 'strategyVariantName',
    payload: { type: 'string', value: 'strategyVariantValue' },
    enabled: true,
    feature_enabled: true,
    featureEnabled: true,
  });
});

test('should return disabled variant for non-matching strategy variant', async () => {
  const feature = buildToggle(
    'feature-x',
    false,
    [
      {
        name: 'default',
        constraints: [],
        variants: [
          {
            name: 'strategyVariantName',
            payload: { type: 'string', value: 'strategyVariantValue' },
            weight: 1000,
          },
        ],
        parameters: {},
      },
    ],
    [],
    true,
  );
  const client = await loadClient(feature, []);
  const enabled = client.isEnabled('feature-x', {}, () => false);
  const variant = client.getVariant('feature-x', {});
  expect(enabled).toBe(false);
  expect(variant).toStrictEqual({
    name: 'disabled',
    enabled: false,
    payload: undefined,
    feature_enabled: false,
    featureEnabled: false,
  });
});
