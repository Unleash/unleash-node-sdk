import 'vitest';

declare module 'vitest' {
  interface TestContext {
    plan(count: number): void;
    true(value: unknown, message?: string): void;
    false(value: unknown, message?: string): void;
    truthy(value: unknown, message?: string): void;
    falsy(value: unknown, message?: string): void;
    assert(value: unknown, message?: string): void;
    is(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    throws(fn: () => unknown): void;
    notThrows(fn: () => unknown): void;
    fail(message?: string): void;
    pass(): void;
    regex(value: string, pattern: RegExp, message?: string): void;
    snapshot(value: unknown): void;
  }
}
