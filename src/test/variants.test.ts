import { expect, test } from 'vitest';
import type { Context } from '../context';
import { client, FakeFetcher, type Feature, state } from './fixtures';

async function getVariant(feature: Feature, context: Context) {
  const sdk = client({ fetcher: new FakeFetcher(state([feature])) });
  await sdk.start();
  return sdk.getVariant(feature.name, context);
}

function genVariants(n: number): NonNullable<Feature['variants']> {
  return Array.from(new Array(n)).map((_v, i) => ({
    name: `variant${i + 1}`,
    payload: {
      type: 'string',
      value: '',
    },
    weight: 1,
  }));
}
function createFeature(variants: Feature['variants'] = []): Feature {
  return {
    name: 'toggleName',
    enabled: true,
    strategies: [],
    variants: variants || [],
  };
}

test('getVariant should return disabled without variants', async () => {
  const variant = await getVariant(createFeature(), {
    toggleName: 'toggleName',
    userId: 'a',
  });
  expect(variant).toMatchObject({ name: 'disabled', enabled: false, feature_enabled: true });
});

test('getVariant should select on 1 variant', async () => {
  const variant = await getVariant(createFeature(genVariants(1)), {
    toggleName: 'toggleName',
    userId: 'a',
  });
  expect(variant).not.toBeNull();
  expect(variant?.name).toEqual('variant1');
});

test('getVariant should select on 2 variants', async () => {
  const feature = createFeature(genVariants(2));
  const variant = await getVariant(feature, { toggleName: 'toggleName', userId: 'a' });
  expect(variant?.name).toEqual('variant1');
  const variant2 = await getVariant(feature, { toggleName: 'toggleName', userId: '0' });
  expect(variant2?.name).toEqual('variant2');
});

test('getVariant should use variant stickiness when specified to select variant', async () => {
  const variants = genVariants(2).map((v) => ({ ...v, stickiness: 'someField' }));
  const feature = createFeature(variants);
  const variant = await getVariant(feature, { someField: 'a' });
  expect(variant?.name).toEqual('variant1');
  const variant2 = await getVariant(feature, { someField: '0' });
  expect(variant2?.name).toEqual('variant2');
});

test('getVariant should use variant stickiness for many variants', async () => {
  const variants = genVariants(4).map((v) => ({ ...v, stickiness: 'organization', weight: 25 }));

  const feature = createFeature(variants);

  const variant = await getVariant(feature, { organization: '1430' });
  expect(variant?.name).toEqual('variant1');
  const variant2 = await getVariant(feature, { organization: '125' });
  expect(variant2?.name).toEqual('variant2');
  const variant3 = await getVariant(feature, { organization: '930' });
  expect(variant3?.name).toEqual('variant3');
  const variant4 = await getVariant(feature, { organization: '381' });
  expect(variant4?.name).toEqual('variant4');
});

test('getVariant should select on 3 variants', async () => {
  const feature = createFeature(genVariants(3));
  const variant = await getVariant(feature, { toggleName: 'toggleName', userId: '0' });
  expect(variant?.name).toEqual('variant1');
  const variant2 = await getVariant(feature, { toggleName: 'toggleName', userId: 'zxa' });
  expect(variant2?.name).toEqual('variant2');
  const variant3 = await getVariant(feature, { toggleName: 'toggleName', userId: 'ya' });
  expect(variant3?.name).toEqual('variant3');
});

test('getVariant should use variant overrides', async () => {
  const variants = genVariants(3);
  variants[0].overrides = [
    {
      contextName: 'userId',
      values: ['z'],
    },
  ];

  const feature = createFeature(variants);
  const variant1 = await getVariant(feature, { toggleName: 'toggleName', userId: 'z' });
  expect(variant1?.name).toEqual('variant1');
});

test('getVariant should use *first* variant override', async () => {
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
  const variant1 = await getVariant(feature, { toggleName: 'toggleName', userId: 'z' });
  expect(variant1?.name).toEqual('variant1');
});

test('getVariant should use *first* variant override for userId=132', async () => {
  const featureToggle: Feature = {
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
  const variant1 = await getVariant(featureToggle, { userId: '132' });
  expect(variant1?.name).toEqual('variant1');
});
