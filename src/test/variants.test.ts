import { expect, test } from 'vitest';
import { selectVariant } from '../variant';

function genVariants(n: number) {
  return Array.from(new Array(n)).map((_v, i) => ({
    name: `variant${i + 1}`,
    payload: {
      type: 'string',
      value: '',
    },
    weight: 1,
  }));
}
//@ts-expect-error
function createFeature(variants) {
  return {
    name: 'toggleName',
    enabled: true,
    strategies: [],
    variants: variants || [],
  };
}

test('selectVariant should return null', () => {
  //@ts-expect-error
  const variant = selectVariant(createFeature(), {
    toggleName: 'toggleName',
    userId: 'a',
  });
  expect(variant).toBeNull();
});

test('selectVariant should select on 1 variant', () => {
  const variant = selectVariant(createFeature(genVariants(1)), {
    toggleName: 'toggleName',
    userId: 'a',
  });
  expect(variant).not.toBeNull();
  expect(variant?.name).toEqual('variant1');
});

test('selectVariant should select on 2 variants', () => {
  const feature = createFeature(genVariants(2));
  const variant = selectVariant(feature, { toggleName: 'toggleName', userId: 'a' });
  expect(variant?.name).toEqual('variant1');
  const variant2 = selectVariant(feature, { toggleName: 'toggleName', userId: '0' });
  expect(variant2?.name).toEqual('variant2');
});

test('selectVariant should use variant stickiness when specified to select variant', () => {
  const variants = genVariants(2).map((v) => ({ ...v, stickiness: 'someField' }));
  const feature = createFeature(variants);
  const variant = selectVariant(feature, { someField: 'a' });
  expect(variant?.name).toEqual('variant1');
  const variant2 = selectVariant(feature, { someField: '0' });
  expect(variant2?.name).toEqual('variant2');
});

test('selectVariant should use variant stickiness for many variants', () => {
  const variants = genVariants(4).map((v) => ({ ...v, stickiness: 'organization', weight: 25 }));

  const feature = createFeature(variants);

  const variant = selectVariant(feature, { organization: '1430' });
  expect(variant?.name).toEqual('variant1');
  const variant2 = selectVariant(feature, { organization: '125' });
  expect(variant2?.name).toEqual('variant2');
  const variant3 = selectVariant(feature, { organization: '930' });
  expect(variant3?.name).toEqual('variant3');
  const variant4 = selectVariant(feature, { organization: '381' });
  expect(variant4?.name).toEqual('variant4');
});

test('selectVariant should select on 3 variants', () => {
  const feature = createFeature(genVariants(3));
  const variant = selectVariant(feature, { toggleName: 'toggleName', userId: '0' });
  expect(variant?.name).toEqual('variant1');
  const variant2 = selectVariant(feature, { toggleName: 'toggleName', userId: 'zxa' });
  expect(variant2?.name).toEqual('variant2');
  const variant3 = selectVariant(feature, { toggleName: 'toggleName', userId: 'ya' });
  expect(variant3?.name).toEqual('variant3');
});

test('selectVariant should use variant overrides', () => {
  const variants = genVariants(3);
  //@ts-expect-error
  variants[0].overrides = [
    {
      contextName: 'userId',
      values: ['z'],
    },
  ];

  const feature = createFeature(variants);
  const variant1 = selectVariant(feature, { toggleName: 'toggleName', userId: 'z' });
  expect(variant1?.name).toEqual('variant1');
});

test('selectVariant should use *first* variant override', () => {
  const variants = genVariants(3);
  //@ts-expect-error
  variants[0].overrides = [
    {
      contextName: 'userId',
      values: ['z', 'b'],
    },
  ];

  //@ts-expect-error
  variants[1].overrides = [
    {
      contextName: 'userId',
      values: ['z'],
    },
  ];

  const feature = createFeature(variants);
  const variant1 = selectVariant(feature, { toggleName: 'toggleName', userId: 'z' });
  expect(variant1?.name).toEqual('variant1');
});

test('selectVariant should use *first* variant override for userId=132', () => {
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
  //@ts-expect-error
  const variant1 = selectVariant(featureToggle, { userId: '132' });
  expect(variant1?.name).toEqual('variant1');
});
