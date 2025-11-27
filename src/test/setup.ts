import { beforeEach, expect } from 'vitest';

// Suppress noisy background fetches that hit Nock after tests complete. Ava used to swallow these.
process.setMaxListeners(50);

declare module 'vitest' {
  interface TestContext {
    plan(count: number): void;
    true(value: unknown, message?: string): void;
    false(value: unknown, message?: string): void;
    truthy(value: unknown, message?: string): void;
    falsy(value: unknown, message?: string): void;
    is(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    throws(fn: () => unknown, message?: string): void;
    notThrows(fn: () => unknown, message?: string): void;
    fail(message?: string): void;
    pass(): void;
    regex(value: string, pattern: RegExp, message?: string): void;
    snapshot(value: unknown): void;
  }
}

beforeEach((ctx) => {
  ctx.plan = (count: number) => expect.assertions(count);
  ctx.true = (value: unknown, message?: string) => expect(value, message).toBeTruthy();
  ctx.false = (value: unknown, message?: string) => expect(value, message).toBeFalsy();
  ctx.truthy = (value: unknown, message?: string) => expect(value, message).toBeTruthy();
  ctx.falsy = (value: unknown, message?: string) => expect(value, message).toBeFalsy();
  ctx.assert = (value: unknown, message?: string) => expect(value, message).toBeTruthy();
  ctx.is = (actual: unknown, expected: unknown, message?: string) =>
    expect(actual, message).toBe(expected);
  ctx.deepEqual = (actual: unknown, expected: unknown, message?: string) =>
    expect(actual, message).toStrictEqual(expected);
  ctx.throws = (fn: () => unknown) => expect(fn).toThrow();
  ctx.notThrows = (fn: () => unknown) => expect(fn).not.toThrow();
  ctx.fail = (message?: string) => {
    throw new Error(message ?? 'Failed');
  };
  ctx.pass = () => {
    expect(true).toBe(true);
  };
  ctx.regex = (value: string, pattern: RegExp, message?: string) =>
    expect(value, message).toMatch(pattern);
  ctx.snapshot = (value: unknown) => expect(value).toMatchSnapshot();
});

const shouldIgnore = (err: any) => {
  if (!err) return false;
  return (
    err.code === 'ERR_NOCK_NO_MATCH' ||
    err.code === 'ENOTFOUND' ||
    (typeof err.message === 'string' &&
      (err.message.includes('EAI_AGAIN') || err.message.includes('ENOTFOUND')))
  );
};

process.on('unhandledRejection', (reason: any) => {
  if (shouldIgnore(reason)) {
    return;
  }
  throw reason;
});

process.on('uncaughtException', (err: any) => {
  if (shouldIgnore(err)) {
    return;
  }
  throw err;
});

// Vitest coverage provider expects minimatch.minimatch; older minimatch only exports the function.
// Patch once so both lint (minimatch v3) and coverage consumers can coexist.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const mm = require('minimatch');
  if (typeof mm === 'function' && !mm.minimatch) {
    // eslint-disable-next-line no-param-reassign
    mm.minimatch = mm;
  }
} catch {
  // ignore if minimatch is unavailable
}
