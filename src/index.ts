import { once } from 'node:events';
import type { ToggleDefinition } from '@unleash/yggdrasil-engine';
import { Context } from './context';
import { UnleashEvents } from './events';
import InMemStorageProvider from './repository/storage-provider-in-mem';
import { TagFilter } from './tags';
import { Unleash } from './unleash';
import type { UnleashConfig } from './unleash-config';
import { defaultVariant, PayloadType, Variant } from './variant';

export { UnleashMetricClient } from './impact-metrics/metric-client';
export type { FetcherInterface, StateUpdate } from './repository/fetcher';
export type { Strategy } from './strategy';

// biome-ignore lint/suspicious/noEmptyInterface: Public module augmentation hook.
export interface UnleashTypes {}

export type Name = UnleashTypes extends { flagNames: infer FlagName extends string }
  ? FlagName
  : string;

// exports
export type { UnleashConfig };
export { Context, InMemStorageProvider, PayloadType, TagFilter, Unleash, UnleashEvents, Variant };

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

export function getFeatureToggleDefinitions(): ToggleDefinition[] {
  return instance ? instance.getFeatureToggleDefinitions() : [];
}

export function getVariant(
  name: string,
  context: Context = {},
  fallbackVariant?: Variant,
): Variant {
  return instance
    ? instance.getVariant(name, context, fallbackVariant)
    : fallbackVariant || defaultVariant;
}

export async function flushMetrics(): Promise<void> {
  return instance?.flushMetrics();
}

export async function destroyWithFlush(): Promise<void> {
  return instance?.destroyWithFlush();
}
