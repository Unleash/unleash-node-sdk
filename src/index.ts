import { once } from 'events';
import { Unleash } from './unleash';
import { Variant, defaultVariant, PayloadType } from './variant';
import { Context } from './context';
import { TagFilter } from './tags';
import { UnleashEvents } from './events';
import { ClientFeaturesResponse } from './feature';
import InMemStorageProvider from './repository/storage-provider-in-mem';
import { UnleashConfig } from './unleash-config';
import { UnleashTypes, Name } from './client';

// exports
export { Strategy } from './strategy/index';
export { Context, Variant, PayloadType, Unleash, TagFilter, InMemStorageProvider, UnleashEvents };
export type { ClientFeaturesResponse, UnleashConfig };
export { UnleashMetricClient } from './impact-metrics/metric-client';
export { UnleashTypes, Name };

let instance: undefined | Unleash;

export function initialize(options: UnleashConfig): Unleash {
  instance = Unleash.getInstance(options);

  return instance;
}

export async function startUnleash(options: UnleashConfig): Promise<Unleash> {
  const unleash = initialize(options);
  if (!unleash.isSynchronized()) {
    await once(unleash, 'synchronized');
  }
  return unleash;
}

export function isEnabled(name: Name, context: Context = {}, fallbackValue?: boolean): boolean {
  return instance ? instance.isEnabled(name, context, fallbackValue) : !!fallbackValue;
}

export function destroy() {
  if (instance) {
    instance.destroy();
  }
  instance = undefined;
}

export function getFeatureToggleDefinition(toggleName: string) {
  return instance && instance.getFeatureToggleDefinition(toggleName);
}

export function getFeatureToggleDefinitions(withFullSegments: boolean = false) {
  return instance && instance.getFeatureToggleDefinitions(withFullSegments as any);
}

export function getVariant(
  name: string,
  context: Context = {},
  fallbackVariant?: Variant,
): Variant {
  const variant = fallbackVariant || defaultVariant;
  return instance ? instance.getVariant(name, context, variant) : variant;
}

export function forceGetVariant(
  name: string,
  context: Context = {},
  fallbackVariant?: Variant,
): Variant {
  const variant = fallbackVariant || defaultVariant;
  return instance ? instance.forceGetVariant(name, context, variant) : variant;
}

export function count(toggleName: string, enabled: boolean) {
  return instance && instance.count(toggleName, enabled);
}

export function countVariant(toggleName: string, variantName: string) {
  return instance && instance.countVariant(toggleName, variantName);
}

export async function flushMetrics(): Promise<void> {
  return instance && instance.flushMetrics();
}

export async function destroyWithFlush(): Promise<void> {
  return instance && instance.destroyWithFlush();
}
