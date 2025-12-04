// @ts-nocheck
import { expect, test } from 'vitest';
import Client from '../client';
import { UnleashEvents } from '../events';
import { defaultStrategies, Strategy } from '../strategy';
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

test('invalid strategy should throw', () => {
  const repo = {
    getToggle() {
      return buildToggle('feature', true);
    },
  };

  expect(() => new Client(repo, [true, null])).toThrow();
  expect(() => new Client(repo, [{}])).toThrow();
  expect(() => new Client(repo, [{ name: 'invalid' }])).toThrow();
  expect(() => new Client(repo, [{ isEnabled: 'invalid' }])).toThrow();
  expect(
    () =>
      new Client(repo, [
        {
          name: 'valid',
          isEnabled: () => {},
        },
        null,
      ]),
  ).toThrow();
});

test('should use provided repository', () => {
  const repo = {
    getToggle() {
      return buildToggle('feature', true);
    },
  };
  const client = new Client(repo, [new Strategy('default', true)]);
  client.on('error', log).on('warn', log);
  const result = client.isEnabled('feature');

  expect(result).toBe(true);
});

test('should fallback when missing feature', () => {
  const repo = {
    getToggle() {
      return null;
    },
  };
  const client = new Client(repo, []);
  client.on('error', log).on('warn', log);

  const result = client.isEnabled('feature-x', {}, () => false);
  expect(result).toBe(false);

  const result2 = client.isEnabled('feature-x', {}, () => true);
  expect(result2).toBe(true);
});

test('should consider toggle not active', () => {
  const repo = {
    getToggle() {
      return buildToggle('feature', false);
    },
  };
  const client = new Client(repo, [new Strategy('default', true)]);
  client.on('error', log).on('warn', log);
  const result = client.isEnabled('feature');

  expect(result).toBe(false);
});

test('should use custom strategy', () => {
  const repo = {
    getToggle() {
      return buildToggle('feature', true, [{ name: 'custom' }]);
    },
  };
  const client = new Client(repo, [new Strategy('default', true), new CustomStrategy()]);
  client.on('error', log).on('warn', log);
  const result = client.isEnabled('feature');

  expect(result).toBe(true);
});

test('should use a set of custom strategies', () => {
  const repo = {
    getToggle() {
      return buildToggle('feature', true, [{ name: 'custom' }, { name: 'custom-false' }]);
    },
  };

  const strategies = [new CustomFalseStrategy(), new CustomStrategy()];
  const client = new Client(repo, strategies);
  client.on('error', log).on('warn', log);
  const result = client.isEnabled('feature');

  expect(result).toBe(true);
});

test('should return false a set of custom-false strategies', () => {
  const repo = {
    getToggle() {
      return buildToggle('feature', true, [{ name: 'custom-false' }, { name: 'custom-false' }]);
    },
  };

  const strategies = [new CustomFalseStrategy(), new CustomStrategy()];
  const client = new Client(repo, strategies);
  client.on('error', log).on('warn', log);
  const result = client.isEnabled('feature');

  expect(result).toBe(false);
});

test('should emit error when invalid feature runtime', () => {
  expect.assertions(3);
  const repo = {
    getToggle() {
      return {
        name: 'feature-malformed-strategies',
        enabled: true,
        strategies: true,
      };
    },
  };

  const strategies = [];
  const client = new Client(repo, strategies);
  client.on('error', (err) => {
    expect(err).toBeTruthy();
    expect(err.message.startsWith('Malformed feature')).toBe(true);
  });
  client.on('warn', log);

  expect(client.isEnabled('feature-malformed-strategies')).toBe(false);
});

test('should emit error when mising feature runtime', () => {
  expect.assertions(3);
  const repo = {
    getToggle() {
      return {
        name: 'feature-wrong-strategy',
        enabled: true,
        strategies: [{ name: 'non-existent' }],
      };
    },
  };

  const strategies = [];
  const client = new Client(repo, strategies);
  client.on('error', log);
  client.on('warn', (msg) => {
    expect(msg).toBeTruthy();
    expect(msg.startsWith('Missing strategy')).toBe(true);
  });

  expect(client.isEnabled('feature-wrong-strategy')).toBe(false);
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
  test(`should return variant when equal weight on ${weight1},${weight2},${weight3}`, () => {
    const repo = {
      getToggle() {
        return buildToggle('feature', true, null, [
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
      },
    };

    const strategies = [new Strategy('default', true)];
    const client = new Client(repo, strategies);
    client.on('error', log).on('warn', log);
    const result = client.isEnabled('feature');

    expect(result).toBe(true);

    [id1, id2, id3].forEach((id) => {
      expect(client.getVariant('feature', { userId: id })).toMatchSnapshot();
    });
  });
});

test('should always return defaultVariant if missing variant', () => {
  const repo = {
    getToggle() {
      return buildToggle('feature-but-no-variant', true, []);
    },
  };

  const client = new Client(repo);

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
  expect(result3).toEqual(defaultVariant);
});

test('should not trigger events if impressionData is false', () => {
  let called = false;
  const repo = {
    getToggle() {
      return buildToggle('feature-x', false, undefined, undefined, false);
    },
  };
  const client = new Client(repo, []);
  client.on(UnleashEvents.Impression, () => {
    called = true;
  });

  client.isEnabled('feature-x', {}, () => false);
  client.getVariant('feature-x', {});
  expect(called).toBe(false);
});

test('should trigger events on isEnabled if impressionData is true', () => {
  let called = false;
  const repo = {
    getToggle() {
      return buildToggle('feature-x', false, undefined, undefined, true);
    },
  };
  const client = new Client(repo, []);
  client.on(UnleashEvents.Impression, () => {
    called = true;
  });
  client.isEnabled('feature-x', {}, () => false);
  expect(called).toBe(true);
});

test('should trigger events on unsatisfied dependency', () => {
  let impressionCount = 0;
  const recordedWarnings = [];
  const repo = {
    getToggle(name: string) {
      if (name === 'feature-x') {
        return {
          name: 'feature-x',
          dependencies: [{ feature: 'not-feature-x' }],
          strategies: [{ name: 'default' }],
          variants: [],
          impressionData: true,
        };
      } else {
        return undefined;
      }
    },
  };
  const client = new Client(repo, []);
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
  expect(recordedWarnings).toEqual(['Missing dependency "not-feature-x" for toggle "feature-x"']);
});

test('should trigger events on getVariant if impressionData is true', () => {
  let called = false;
  const repo = {
    getToggle() {
      return buildToggle('feature-x', false, undefined, undefined, true);
    },
  };
  const client = new Client(repo, []);
  client.on(UnleashEvents.Impression, () => {
    called = true;
  });
  client.getVariant('feature-x', {});
  expect(called).toBe(true);
});

test('should favor strategy variant over feature variant', () => {
  const repo = {
    getToggle() {
      return buildToggle(
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
    },
  };
  const client = new Client(repo, defaultStrategies);
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

test('should return disabled variant for non-matching strategy variant', () => {
  const repo = {
    getToggle() {
      return buildToggle(
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
    },
  };
  const client = new Client(repo, defaultStrategies);
  const enabled = client.isEnabled('feature-x', {}, () => false);
  const variant = client.getVariant('feature-x', {});
  expect(enabled).toBe(false);
  expect(variant).toStrictEqual({
    name: 'disabled',
    enabled: false,
    feature_enabled: false,
    featureEnabled: false,
  });
});
