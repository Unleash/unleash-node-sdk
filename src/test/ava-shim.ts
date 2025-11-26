import { afterAll, afterEach, beforeAll, beforeEach, expect, test as vitestTest } from 'vitest';

type AssertionContext = {
  plan: (count: number) => void;
  true: (value: unknown, message?: string) => void;
  false: (value: unknown, message?: string) => void;
  is: (actual: unknown, expected: unknown, message?: string) => void;
  deepEqual: (actual: unknown, expected: unknown, message?: string) => void;
  like: (actual: object, expected: object, message?: string) => void;
  truthy: (value: unknown, message?: string) => void;
  falsy: (value: unknown, message?: string) => void;
  throws: (fn: () => unknown, expected?: unknown) => void;
  notThrows: (fn: () => unknown) => void;
  regex: (value: string, matcher: RegExp, message?: string) => void;
  snapshot: (value: unknown) => void;
  assert: (value: unknown, message?: string) => void;
  pass: () => void;
  fail: (message?: string) => never;
};

type TestFn = (t: AssertionContext) => void | Promise<void>;
type AvaTest = {
  (title: string, fn: TestFn): void;
  skip: (title: string, fn?: TestFn) => void;
  only: (title: string, fn: TestFn) => void;
  serial: (title: string, fn: TestFn) => void;
  before: (fn: TestFn) => void;
  after: (fn: TestFn) => void;
  beforeEach: (fn: TestFn) => void;
  afterEach: (fn: TestFn) => void;
};

function createAssertions(): AssertionContext {
  return {
    plan: (count: number) => expect.assertions(count),
    true: (value: unknown, message?: string) => expect(value, message).toBeTruthy(),
    false: (value: unknown, message?: string) => expect(value, message).toBeFalsy(),
    is: (actual: unknown, expected: unknown, message?: string) =>
      expect(actual, message).toBe(expected),
    deepEqual: (actual: unknown, expected: unknown, message?: string) =>
      expect(actual, message).toStrictEqual(expected),
    like: (actual: object, expected: object, message?: string) =>
      expect(actual, message).toMatchObject(expected),
    truthy: (value: unknown, message?: string) => expect(value, message).toBeTruthy(),
    falsy: (value: unknown, message?: string) => expect(value, message).toBeFalsy(),
    throws: (fn: () => unknown, expected?: unknown) =>
      expected ? expect(fn).toThrow(expected as any) : expect(fn).toThrow(),
    notThrows: (fn: () => unknown) => expect(fn).not.toThrow(),
    regex: (value: string, matcher: RegExp, message?: string) =>
      expect(value, message).toMatch(matcher),
    snapshot: (value: unknown) => expect(value).toMatchSnapshot(),
    assert: (value: unknown, message?: string) => expect(value, message).toBeTruthy(),
    pass: () => expect(true).toBe(true),
    fail: (message?: string) => {
      throw new Error(message || 'Test failed');
    },
  };
}

const wrap = (fn: TestFn) => () => {
  const t = createAssertions();
  return fn(t);
};

const test = ((title: string, fn: TestFn) => vitestTest(title, wrap(fn))) as AvaTest;

test.skip = (title: string, fn?: TestFn) =>
  fn ? vitestTest.skip(title, wrap(fn)) : vitestTest.skip(title);
test.only = (title: string, fn: TestFn) => vitestTest.only(title, wrap(fn));
test.serial = (title: string, fn: TestFn) => vitestTest.sequential(title, wrap(fn));
test.before = (fn: TestFn) => beforeAll(wrap(fn));
test.after = (fn: TestFn) => afterAll(wrap(fn));
test.beforeEach = (fn: TestFn) => beforeEach(wrap(fn));
test.afterEach = (fn: TestFn) => afterEach(wrap(fn));

export default test;
