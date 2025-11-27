import type { Context } from './context';
import type { FeatureInterface } from './feature';
import { resolveContextValue } from './helpers';
import { normalizedVariantValue } from './strategy/util';

export enum PayloadType {
  STRING = 'string',
  JSON = 'json',
  CSV = 'csv',
  NUMBER = 'number',
}

interface Override {
  contextName: string;
  values: string[];
}

export interface Payload {
  type: PayloadType;
  value: string;
}

export interface VariantDefinition {
  name: string;
  weight: number;
  stickiness?: string;
  payload?: Payload;
  overrides?: Override[];
}

export interface Variant {
  name: string;
  enabled: boolean;
  payload?: Payload;
  feature_enabled?: boolean;
}

export const defaultVariant: Variant = {
  name: 'disabled',
  enabled: false,
  feature_enabled: false,
};

/**
 * @deprecated Use {@link Variant} instead and feature_enabled field
 */
export interface VariantWithFeatureStatus extends Variant {
  /**
   * @deprecated Use {@link feature_enabled} instead
   */
  featureEnabled: boolean;
}

/**
 * @deprecated Use {@link defaultVariant} const instead
 */
export function getDefaultVariant(): Variant {
  return defaultVariant;
}

function randomString() {
  return String(Math.round(Math.random() * 100000));
}

const stickinessSelectors = ['userId', 'sessionId', 'remoteAddress'];

function getSeed(context: Context, stickiness: string = 'default'): string {
  if (stickiness !== 'default') {
    const value = resolveContextValue(context, stickiness);
    return value ? value.toString() : randomString();
  }
  let result: string | undefined;
  stickinessSelectors.some((key: string): boolean => {
    const value = context[key];
    if (typeof value === 'string' && value !== '') {
      result = value;
      return true;
    }
    return false;
  });
  return result || randomString();
}

function overrideMatchesContext(context: Context): (o: Override) => boolean {
  return (o: Override) =>
    o.values.some((value) => value === resolveContextValue(context, o.contextName));
}

function findOverride(
  variants: VariantDefinition[],
  context: Context,
): VariantDefinition | undefined {
  return variants
    .filter((variant) => variant.overrides)
    .find((variant) => variant.overrides?.some(overrideMatchesContext(context)));
}

export function selectVariantDefinition(
  groupId: string,
  stickiness: string | undefined,
  variants: VariantDefinition[],
  context: Context,
): VariantDefinition | null {
  const totalWeight = variants.reduce((acc, v) => acc + v.weight, 0);
  if (totalWeight <= 0) {
    return null;
  }
  const variantOverride = findOverride(variants, context);
  if (variantOverride) {
    return variantOverride;
  }

  const target = normalizedVariantValue(getSeed(context, stickiness), groupId, totalWeight);

  let counter = 0;
  const variant = variants.find((v: VariantDefinition): VariantDefinition | undefined => {
    if (v.weight === 0) {
      return undefined;
    }
    counter += v.weight;
    if (counter < target) {
      return undefined;
    }
    return v;
  });
  return variant || null;
}

export function selectVariant(
  feature: FeatureInterface,
  context: Context,
): VariantDefinition | null {
  const stickiness = feature.variants?.[0]?.stickiness ?? undefined;
  return selectVariantDefinition(feature.name, stickiness, feature.variants || [], context);
}
