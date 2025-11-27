import { EventEmitter } from 'node:events';
import type { Context } from './context';
import { createImpressionEvent, UnleashEvents } from './events';
import type { FeatureInterface } from './feature';
import type { RepositoryInterface } from './repository';
import type { Strategy, StrategyTransportInterface } from './strategy';
import type { Constraint, Segment, StrategyResult } from './strategy/strategy';
import {
  defaultVariant,
  selectVariant,
  type Variant,
  type VariantDefinition,
  type VariantWithFeatureStatus,
} from './variant';

interface BooleanMap {
  [key: string]: boolean;
}

/**
 * Type for toggle name queries. Defaults to string but can be augmented by users.
 * Users can extend this via module augmentation:
 *
 * declare module 'unleash-client' {
 *   interface UnleashTypes {
 *     flagNames: string;
 *   }
 * }
 */
export interface UnleashTypes {
  [key: string]: unknown;
}

type GetCustom<K extends PropertyKey, Fallback> = K extends keyof UnleashTypes
  ? UnleashTypes[K]
  : Fallback;
export type Name = GetCustom<'flagNames', string>;

export default class UnleashClient extends EventEmitter {
  private repository: RepositoryInterface;

  private strategies: Strategy[];

  private warnedStrategies: BooleanMap;

  private warnedDependencies: BooleanMap;

  constructor(repository: RepositoryInterface, strategies: Strategy[]) {
    super();
    this.repository = repository;
    this.strategies = strategies || [];
    this.warnedStrategies = {};
    this.warnedDependencies = {};

    this.strategies.forEach((strategy: Strategy) => {
      if (
        !strategy ||
        !strategy.name ||
        !strategy.isEnabled ||
        typeof strategy.isEnabled !== 'function'
      ) {
        throw new Error('Invalid strategy data / interface');
      }
    });
  }

  private getStrategy(name: string): Strategy | undefined {
    return this.strategies.find((strategy: Strategy): boolean => strategy.name === name);
  }

  warnStrategyOnce(
    missingStrategy: string,
    name: string,
    strategies: StrategyTransportInterface[],
  ) {
    if (!this.warnedStrategies[missingStrategy + name]) {
      this.warnedStrategies[missingStrategy + name] = true;
      this.emit(
        UnleashEvents.Warn,
        `Missing strategy "${missingStrategy}" for toggle "${name}". Ensure that "${strategies
          .map(({ name: n }) => n)
          .join(', ')}" are supported before using this toggle`,
      );
    }
  }

  warnDependencyOnce(missingDependency: string, name: string) {
    if (!this.warnedDependencies[missingDependency + name]) {
      this.warnedDependencies[missingDependency + name] = true;
      this.emit(
        UnleashEvents.Warn,
        `Missing dependency "${missingDependency}" for toggle "${name}"`,
      );
    }
  }

  isParentDependencySatisfied(feature: FeatureInterface | undefined, context: Context) {
    if (!feature?.dependencies?.length) {
      return true;
    }

    return feature.dependencies.every((parent) => {
      const parentToggle = this.repository.getToggle(parent.feature);

      if (!parentToggle) {
        this.warnDependencyOnce(parent.feature, feature.name);
        return false;
      }
      if (parentToggle.dependencies?.length) {
        return false;
      }

      if (parent.enabled !== false) {
        if (parent.variants?.length) {
          const { name, feature_enabled: featureEnabled } = this.getVariant(
            parent.feature,
            context,
          );
          return featureEnabled && parent.variants.includes(name);
        }
        return this.isEnabled(parent.feature, context, () => false);
      }

      return !this.isEnabled(parent.feature, context, () => false);
    });
  }

  isEnabled(name: Name, context: Context, fallback: () => boolean): boolean {
    const feature = this.repository.getToggle(name);
    const enabled = this.isFeatureEnabled(feature, context, fallback).enabled;

    if (feature?.impressionData) {
      this.emit(
        UnleashEvents.Impression,
        createImpressionEvent({
          featureName: name,
          context,
          enabled,
          eventType: 'isEnabled',
        }),
      );
    }

    return enabled;
  }

  isFeatureEnabled(
    feature: FeatureInterface | undefined,
    context: Context,
    fallback: () => boolean,
  ): StrategyResult {
    if (!feature) {
      return { enabled: fallback() };
    }

    if (!feature || !this.isParentDependencySatisfied(feature, context) || !feature.enabled) {
      return { enabled: false };
    }

    if (!Array.isArray(feature.strategies)) {
      const msg = `Malformed feature, strategies not an array, is a ${typeof feature.strategies}`;
      this.emit(UnleashEvents.Error, new Error(msg));
      return { enabled: false };
    }

    if (feature.strategies.length === 0) {
      return { enabled: feature.enabled } as StrategyResult;
    }

    let strategyResult: StrategyResult = { enabled: false };

    feature.strategies?.some((strategySelector): boolean => {
      const strategy = this.getStrategy(strategySelector.name);
      if (!strategy) {
        this.warnStrategyOnce(strategySelector.name, feature.name, feature.strategies || []);
        return false;
      }
      const constraints = this.yieldConstraintsFor(strategySelector);
      const result = strategy.getResult(
        strategySelector.parameters,
        context,
        constraints,
        strategySelector.variants,
      );

      if (result.enabled) {
        strategyResult = result;
        return true;
      }
      return false;
    });

    return strategyResult;
  }

  *yieldConstraintsFor(
    strategy: StrategyTransportInterface,
  ): IterableIterator<Constraint | undefined> {
    if (strategy.constraints) {
      yield* strategy.constraints;
    }
    const segments = strategy.segments?.map((segmentId) => this.repository.getSegment(segmentId));
    if (!segments) {
      return;
    }
    yield* this.yieldSegmentConstraints(segments);
  }

  *yieldSegmentConstraints(
    segments: (Segment | undefined)[],
  ): IterableIterator<Constraint | undefined> {
    // eslint-disable-next-line no-restricted-syntax
    for (const segment of segments) {
      if (segment) {
        // eslint-disable-next-line no-restricted-syntax
        for (const constraint of segment.constraints ?? []) {
          yield constraint;
        }
      } else {
        yield undefined;
      }
    }
  }

  getVariant(name: string, context: Context, fallbackVariant?: Variant): VariantWithFeatureStatus {
    const feature = this.repository.getToggle(name);
    const variant = this.resolveVariant(feature, context, true, fallbackVariant);
    if (feature?.impressionData) {
      this.emit(
        UnleashEvents.Impression,
        createImpressionEvent({
          featureName: name,
          context,
          enabled: variant.enabled,
          eventType: 'getVariant',
          variant: variant.name,
        }),
      );
    }
    return variant;
  }

  // This function is intended to close an issue in the proxy where feature enabled
  // state gets checked twice when resolving a variant with random stickiness and
  // gradual rollout. This is not intended for general use, prefer getVariant instead
  forceGetVariant(
    name: string,
    context: Context,
    fallbackVariant?: Variant,
  ): VariantWithFeatureStatus {
    const feature = this.repository.getToggle(name);
    return this.resolveVariant(feature, context, true, fallbackVariant);
  }

  private resolveVariant(
    feature: FeatureInterface | undefined,
    context: Context,
    checkToggle: boolean,
    fallbackVariant?: Variant,
  ): VariantWithFeatureStatus {
    const fallback = fallbackVariant || defaultVariant;

    if (typeof feature === 'undefined') {
      return { ...fallback, feature_enabled: false, featureEnabled: false };
    }

    let featureEnabled = !checkToggle;
    if (checkToggle) {
      const result = this.isFeatureEnabled(feature, context, () => !!fallbackVariant?.enabled);
      featureEnabled = result.enabled;

      if (result.enabled && result.variant) {
        return { ...result.variant, feature_enabled: featureEnabled, featureEnabled };
      }

      if (!result.enabled) {
        return { ...fallback, feature_enabled: featureEnabled, featureEnabled };
      }
    }

    if (!feature.variants || !Array.isArray(feature.variants) || feature.variants.length === 0) {
      return { ...fallback, feature_enabled: featureEnabled, featureEnabled };
    }

    const variant: VariantDefinition | null = selectVariant(feature, context);
    if (variant === null) {
      return { ...fallback, feature_enabled: featureEnabled, featureEnabled };
    }

    return {
      name: variant.name,
      payload: variant.payload,
      enabled: true,
      feature_enabled: featureEnabled,
      featureEnabled,
    };
  }
}
