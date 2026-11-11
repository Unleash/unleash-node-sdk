export enum PayloadType {
  STRING = 'string',
  JSON = 'json',
  CSV = 'csv',
  NUMBER = 'number',
}

export interface Payload {
  type: PayloadType;
  value: string;
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
