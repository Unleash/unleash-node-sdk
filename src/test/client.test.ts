// @ts-nocheck
import test from './test-shim';
import Client from '../client';
import { defaultStrategies, Strategy } from '../strategy';

import CustomStrategy from './true_custom_strategy';
import CustomFalseStrategy from './false_custom_strategy';
import { UnleashEvents } from '../events';

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

test('invalid strategy should throw', (t) => {
  const repo = {
    getToggle() {
      return buildToggle('feature', true);
    },
  };

  t.throws(() => new Client(repo, [true, null]));
  t.throws(() => new Client(repo, [{}]));
  t.throws(() => new Client(repo, [{ name: 'invalid' }]));
  t.throws(() => new Client(repo, [{ isEnabled: 'invalid' }]));
  t.throws(
    () =>
      new Client(repo, [
        {
          name: 'valid',
          isEnabled: () => {},
        },
        null,
      ]),
  );
});

test('should use provided repository', (t) => {
  const repo = {
    getToggle() {
      return buildToggle('feature', true);
    },
  };
  const client = new Client(repo, [new Strategy('default', true)]);
  client.on('error', log).on('warn', log);
  const result = client.isEnabled('feature');

  t.true(result);
});

test('should fallback when missing feature', (t) => {
  const repo = {
    getToggle() {
      return null;
    },
  };
  const client = new Client(repo, []);
  client.on('error', log).on('warn', log);

  const result = client.isEnabled('feature-x', {}, () => false);
  t.true(result === false);

  const result2 = client.isEnabled('feature-x', {}, () => true);
  t.true(result2 === true);
});

test('should consider toggle not active', (t) => {
  const repo = {
    getToggle() {
      return buildToggle('feature', false);
    },
  };
  const client = new Client(repo, [new Strategy('default', true)]);
  client.on('error', log).on('warn', log);
  const result = client.isEnabled('feature');

  t.true(!result);
});

test('should use custom strategy', (t) => {
  const repo = {
    getToggle() {
      return buildToggle('feature', true, [{ name: 'custom' }]);
    },
  };
  const client = new Client(repo, [new Strategy('default', true), new CustomStrategy()]);
  client.on('error', log).on('warn', log);
  const result = client.isEnabled('feature');

  t.true(result);
});

test('should use a set of custom strategies', (t) => {
  const repo = {
    getToggle() {
      return buildToggle('feature', true, [{ name: 'custom' }, { name: 'custom-false' }]);
    },
  };

  const strategies = [new CustomFalseStrategy(), new CustomStrategy()];
  const client = new Client(repo, strategies);
  client.on('error', log).on('warn', log);
  const result = client.isEnabled('feature');

  t.true(result);
});

test('should return false a set of custom-false strategies', (t) => {
  const repo = {
    getToggle() {
      return buildToggle('feature', true, [{ name: 'custom-false' }, { name: 'custom-false' }]);
    },
  };

  const strategies = [new CustomFalseStrategy(), new CustomStrategy()];
  const client = new Client(repo, strategies);
  client.on('error', log).on('warn', log);
  const result = client.isEnabled('feature');

  t.true(result === false);
});

test('should emit error when invalid feature runtime', (t) => {
  t.plan(3);
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
    t.truthy(err);
    t.true(err.message.startsWith('Malformed feature'));
  });
  client.on('warn', log);

  t.true(client.isEnabled('feature-malformed-strategies') === false);
});

test('should emit error when mising feature runtime', (t) => {
  t.plan(3);
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
    t.truthy(msg);
    t.true(msg.startsWith('Missing strategy'));
  });

  t.true(client.isEnabled('feature-wrong-strategy') === false);
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
  test(`should return variant when equal weight on ${weight1},${weight2},${weight3}`, (t) => {
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

    t.true(result === true);

    [id1, id2, id3].forEach((id) => {
      t.snapshot(client.getVariant('feature', { userId: id }));
    });
  });
});

test('should always return defaultVariant if missing variant', (t) => {
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
  t.deepEqual(result, defaultVariant);

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

  t.deepEqual(result2, fallback);

  const result3 = client.getVariant('missing-feature-x', {});
  t.deepEqual(result3, defaultVariant);
});

test('should not trigger events if impressionData is false', (t) => {
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
  t.false(called);
});

test('should trigger events on isEnabled if impressionData is true', (t) => {
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
  t.true(called);
});

test('should trigger events on unsatisfied dependency', (t) => {
  let impressionCount = 0;
  let recordedWarnings = [];
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
  t.deepEqual(impressionCount, 2);
  t.deepEqual(recordedWarnings, ['Missing dependency "not-feature-x" for toggle "feature-x"']);
});

test('should trigger events on getVariant if impressionData is true', (t) => {
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
  t.true(called);
});

test('should favor strategy variant over feature variant', (t) => {
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
  t.true(enabled);
  t.deepEqual(variant, {
    name: 'strategyVariantName',
    payload: { type: 'string', value: 'strategyVariantValue' },
    enabled: true,
    feature_enabled: true,
    featureEnabled: true,
  });
});

test('should return disabled variant for non-matching strategy variant', (t) => {
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
  t.false(enabled);
  t.deepEqual(variant, {
    name: 'disabled',
    enabled: false,
    feature_enabled: false,
    featureEnabled: false,
  });
});
