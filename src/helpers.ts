import { hostname, type UserInfo, userInfo } from 'node:os';
import * as murmurHash3 from 'murmurhash3js';
import type { Context } from './context';

export type FallbackFunction = (name: unknown, context: Context) => boolean;

export function createFallbackFunction(
  name: unknown,
  context: Context,
  fallback?: FallbackFunction | boolean,
): () => boolean {
  if (typeof fallback === 'function') {
    return () => fallback(name, context);
  }
  if (typeof fallback === 'boolean') {
    return () => fallback;
  }
  return () => false;
}

export function resolveContextValue(context: Context, field: string): string | undefined {
  const contextValue = context[field] ?? context.properties?.[field];
  return contextValue !== undefined && contextValue !== null ? String(contextValue) : undefined;
}

export function safeName(str: string = '') {
  return str.replace(/\//g, '_');
}

export function generateInstanceId(instanceId?: string): string {
  if (instanceId) {
    return instanceId;
  }
  let info: UserInfo<string> | undefined;
  try {
    info = userInfo();
  } catch (_e) {
    // unable to read info;
  }

  const prefix = info
    ? info.username
    : `generated-${Math.round(Math.random() * 1000000)}-${process.pid}`;
  return `${prefix}-${hostname()}`;
}

export function generateHashOfConfig(o: unknown): string {
  const oAsString = JSON.stringify(o);
  return murmurHash3.x86.hash128(oAsString);
}

export function getAppliedJitter(jitter: number): number {
  const appliedJitter = Math.random() * jitter;
  return Math.random() < 0.5 ? -appliedJitter : appliedJitter;
}
