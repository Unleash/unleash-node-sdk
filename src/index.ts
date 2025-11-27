import { once } from 'node:events';
import { Name, UnleashTypes } from './client';
import { Context } from './context';
import { UnleashEvents } from './events';
import type { ClientFeaturesResponse } from './feature';
import InMemStorageProvider from './repository/storage-provider-in-mem';
import { TagFilter } from './tags';
import { Unleash } from './unleash';
import type { UnleashConfig } from './unleash-config';
import { defaultVariant, PayloadType, Variant } from './variant';

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
  return instance?.getFeatureToggleDefinition(toggleName);
}

export function getFeatureToggleDefinitions(withFullSegments: boolean = false) {
  return instance?.getFeatureToggleDefinitions(withFullSegments);
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
  return instance?.count(toggleName, enabled);
}

export function countVariant(toggleName: string, variantName: string) {
  return instance?.countVariant(toggleName, variantName);
}

export async function flushMetrics(): Promise<void> {
  return instance?.flushMetrics();
}

export async function destroyWithFlush(): Promise<void> {
  return instance?.destroyWithFlush();
}
