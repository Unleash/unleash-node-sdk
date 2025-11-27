// @ts-nocheck
import { test } from 'vitest';
import { selectVariant } from '../variant';

function genVariants(n) {
  return Array.from(new Array(n)).map((v, i) => ({
    name: `variant${i + 1}`,
    payload: {
      type: 'string',
      value: '',
    },
    weight: 1,
  }));
}

function createFeature(variants) {
  return {
    name: 'toggleName',
    enabled: true,
    strategies: [],
    variants: variants || [],
  };
}

test('selectVariant should return null', (t) => {
  const variant = selectVariant(createFeature(), {
    toggleName: 'toggleName',
    userId: 'a',
  });
  t.true(variant === null);
});

test('selectVariant should select on 1 variant', (t) => {
  const variant = selectVariant(createFeature(genVariants(1)), {
    toggleName: 'toggleName',
    userId: 'a',
  });
  t.true(variant.name === 'variant1');
});

test('selectVariant should select on 2 variants', (t) => {
  const feature = createFeature(genVariants(2));
  const variant = selectVariant(feature, { toggleName: 'toggleName', userId: 'a' });
  t.true(variant.name === 'variant1');
  const variant2 = selectVariant(feature, { toggleName: 'toggleName', userId: '0' });
  t.true(variant2.name === 'variant2');
});

test('selectVariant should use variant stickiness when specified to select variant', (t) => {
  const variants = genVariants(2).map((v) => ({ ...v, stickiness: 'someField' }));
  const feature = createFeature(variants);
  const variant = selectVariant(feature, { someField: 'a' });
  t.true(variant.name === 'variant1');
  const variant2 = selectVariant(feature, { someField: '0' });
  t.true(variant2.name === 'variant2');
});

test('selectVariant should use variant stickiness for many variants', (t) => {
  const variants = genVariants(4).map((v) => ({ ...v, stickiness: 'organization', weight: 25 }));

  const feature = createFeature(variants);

  const variant = selectVariant(feature, { organization: '1430' });
  t.is(variant.name, 'variant1');
  const variant2 = selectVariant(feature, { organization: '125' });
  t.is(variant2.name, 'variant2');
  const variant3 = selectVariant(feature, { organization: '930' });
  t.is(variant3.name, 'variant3');
  const variant4 = selectVariant(feature, { organization: '381' });
  t.is(variant4.name, 'variant4');
});

test('selectVariant should select on 3 variants', (t) => {
  const feature = createFeature(genVariants(3));
  const variant = selectVariant(feature, { toggleName: 'toggleName', userId: '0' });
  t.true(variant.name === 'variant1');
  const variant2 = selectVariant(feature, { toggleName: 'toggleName', userId: 'zxa' });
  t.true(variant2.name === 'variant2');
  const variant3 = selectVariant(feature, { toggleName: 'toggleName', userId: 'ya' });
  t.true(variant3.name === 'variant3');
});

test('selectVariant should use variant overrides', (t) => {
  const variants = genVariants(3);
  variants[0].overrides = [
    {
      contextName: 'userId',
      values: ['z'],
    },
  ];

  const feature = createFeature(variants);
  const variant1 = selectVariant(feature, { toggleName: 'toggleName', userId: 'z' });
  t.is(variant1.name, 'variant1');
});

test('selectVariant should use *first* variant override', (t) => {
  const variants = genVariants(3);
  variants[0].overrides = [
    {
      contextName: 'userId',
      values: ['z', 'b'],
    },
  ];

  variants[1].overrides = [
    {
      contextName: 'userId',
      values: ['z'],
    },
  ];

  const feature = createFeature(variants);
  const variant1 = selectVariant(feature, { toggleName: 'toggleName', userId: 'z' });
  t.is(variant1.name, 'variant1');
});

test('selectVariant should use *first* variant override for userId=132', (t) => {
  const featureToggle = {
    name: 'Feature.Variants.override.D',
    description: 'Variant with overrides',
    enabled: true,
    strategies: [],
    variants: [
      {
        name: 'variant1',
        weight: 33,
        payload: {
          type: 'string',
          value: 'val1',
        },
        overrides: [
          {
            contextName: 'userId',
            values: ['132', '61'],
          },
        ],
      },
      {
        name: 'variant2',
        weight: 33,
        payload: {
          type: 'string',
          value: 'val2',
        },
      },
      {
        name: 'variant3',
        weight: 34,
        payload: {
          type: 'string',
          value: 'val3',
        },
      },
    ],
  };
  const variant1 = selectVariant(featureToggle, { userId: '132' });
  t.is(variant1.name, 'variant1');
});
