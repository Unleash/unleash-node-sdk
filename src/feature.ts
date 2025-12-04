import type { StrategyTransportInterface } from './strategy';
import type { EnhancedStrategyTransportInterface, Segment } from './strategy/strategy';
import type { VariantDefinition } from './variant';

export interface Dependency {
  feature: string;
  variants?: string[];
  enabled?: boolean;
}

export interface FeatureInterface {
  name: string;
  type?: string;
  project?: string;
  description?: string;
  enabled: boolean;
  stale?: boolean;
  impressionData?: boolean;
  strategies?: StrategyTransportInterface[];
  variants?: VariantDefinition[];
  dependencies?: Dependency[];
}

export interface EnhancedFeatureInterface extends Omit<FeatureInterface, 'strategies'> {
  strategies?: EnhancedStrategyTransportInterface[];
}

export type ApiResponse =
  | (ClientFeaturesDelta & { type: 'delta' })
  | (ClientFeaturesResponse & { type: 'full' });

export interface ClientFeaturesResponse {
  version: number;
  features: FeatureInterface[];
  segments?: Segment[];
  query?: Record<string, unknown>;
}

export interface ClientFeaturesDelta {
  events: DeltaEvent[];
}

export const parseApiResponse = (data: unknown): ApiResponse => {
  if (typeof data !== 'object' || data === null) {
    throw new Error(`Invalid API response: ${JSON.stringify(data, null, 2)}`);
  }
  if ('events' in data && Array.isArray(data.events)) {
    return { ...data, type: 'delta' } as ClientFeaturesDelta & { type: 'delta' };
  } else if ('features' in data && Array.isArray(data.features)) {
    return { ...data, type: 'full' } as ClientFeaturesResponse & { type: 'full' };
  }
  throw new Error(
    `Client features was neither a delta nor a full response: ${JSON.stringify(data, null, 2)}`,
  );
};

export type DeltaEvent =
  | FeatureUpdated
  | FeatureRemoved
  | SegmentUpdated
  | SegmentRemoved
  | Hydration;

export type FeatureUpdated = {
  type: 'feature-updated';
  eventId: number;
  feature: FeatureInterface;
};

export type FeatureRemoved = {
  type: 'feature-removed';
  eventId: number;
  featureName: string;
  project: string;
};

export type SegmentUpdated = {
  type: 'segment-updated';
  eventId: number;
  segment: Segment;
};

export type SegmentRemoved = {
  type: 'segment-removed';
  eventId: number;
  segmentId: number;
};

export type Hydration = {
  type: 'hydration';
  eventId: number;
  features: FeatureInterface[];
  segments: Segment[];
};
