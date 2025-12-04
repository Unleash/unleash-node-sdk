import { expect, test } from 'vitest';

import { Strategy } from '../../strategy/strategy';

test('should be enabled', () => {
  const strategy = new Strategy('test', true);
  // @ts-expect-error
  expect(strategy.isEnabled()).toBe(true);
});

test('should be enabled for environment=dev', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [{ contextName: 'environment', operator: 'IN', values: ['stage', 'dev'] }];
  const context = { environment: 'dev' };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should NOT be enabled for environment=prod', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [{ contextName: 'environment', operator: 'IN', values: ['dev'] }];
  const context = { environment: 'prod' };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(false);
});

test('should NOT be enabled for environment=prod AND userId=123', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    { contextName: 'environment', operator: 'IN', values: ['dev'] },
    { contextName: 'userId', operator: 'IN', values: ['123'] },
  ];
  const context = { environment: 'prod', userId: '123' };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(false);
});

test('should NOT be enabled for environment=dev and strategy return false', () => {
  const strategy = new Strategy('test', false);
  const params = {};
  const constraints = [{ contextName: 'environment', operator: 'IN', values: ['dev'] }];
  const context = { environment: 'dev', userId: '123' };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(false);
});

test('should be enabled when constraints is empty list', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  // @ts-expect-error
  const constraints = [];
  const context = { environment: 'dev', userId: '123' };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when constraints is undefined', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = undefined;
  const context = { environment: 'dev', userId: '123' };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when environment NOT_IN constaints', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    { contextName: 'environment', operator: 'NOT_IN', values: ['dev', 'stage'] },
  ];
  const context = { environment: 'local', userId: '123' };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should not enabled for multiple constraints where last one is not satisfied', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    { contextName: 'environment', operator: 'NOT_IN', values: ['dev', 'stage'] },
    { contextName: 'environment', operator: 'IN', values: ['prod'] },
  ];
  const context = { environment: 'local', userId: '123' };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(false);
});

test('should not enabled for multiple constraints where all are satisfied', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    { contextName: 'environment', operator: 'NOT_IN', values: ['dev', 'stage'] },
    { contextName: 'environment', operator: 'IN', values: ['prod'] },
    { contextName: 'userId', operator: 'IN', values: ['123', '223'] },
    { contextName: 'appName', operator: 'IN', values: ['web'] },
  ];
  const context = { environment: 'prod', userId: '123', appName: 'web' };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when cosutomerId is in constraint', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    { contextName: 'environment', operator: 'IN', values: ['dev', 'stage'] },
    { contextName: 'customer', operator: 'IN', values: ['12', '13'] },
  ];
  const context = {
    environment: 'dev',
    properties: { customer: '13' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

// New constraint operators

test('should be enabled when email startsWith', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [{ contextName: 'email', operator: 'STR_STARTS_WITH', values: ['example'] }];
  const context = {
    environment: 'dev',
    properties: { email: 'example@getunleash.ai' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when email startsWith (multiple)', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    { contextName: 'email', operator: 'STR_STARTS_WITH', values: ['other', 'example'] },
  ];
  const context = {
    environment: 'dev',
    properties: { email: 'example@getunleash.ai' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when email endsWith', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    { contextName: 'email', operator: 'STR_ENDS_WITH', values: ['@getunleash.ai'] },
  ];
  const context = {
    environment: 'dev',
    properties: { email: 'example@getunleash.ai' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when email endsWith, ignoring case', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    {
      contextName: 'email',
      operator: 'STR_ENDS_WITH',
      values: ['@getunleash.ai'],
      caseInsensitive: true,
    },
  ];
  const context = {
    environment: 'dev',
    properties: { email: 'example@GETunleash.ai' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should not be enabled when email endsWith, caring about case', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    { contextName: 'email', operator: 'STR_ENDS_WITH', values: ['@getunleash.ai'] },
  ];
  const context = {
    environment: 'dev',
    properties: { email: 'example@GETunleash.ai' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(false);
});

test('should not be enabled when companyId endsWith, field of incorrect type', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    { contextName: 'companyId', operator: 'STR_ENDS_WITH', values: ['@getunleash.ai'] },
  ];
  const context = {
    environment: 'dev',
    properties: {
      companyId: 123,
    },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(false);
});

test('should be enabled when companyId endsWith, field of incorrect type, inverted', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    {
      contextName: 'companyId',
      operator: 'STR_ENDS_WITH',
      values: ['@getunleash.ai'],
      inverted: true,
    },
  ];
  const context = {
    environment: 'dev',
    properties: {
      companyId: 123,
    },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when email NOT endsWith (inverted)', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    { contextName: 'email', operator: 'STR_ENDS_WITH', values: ['@getunleash.ai'], inverted: true },
  ];
  const context = {
    environment: 'dev',
    properties: { email: 'example@something-else.com' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when email endsWith (multi)', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    {
      contextName: 'email',
      operator: 'STR_ENDS_WITH',
      values: ['@getunleash.ai', '@somerandom-email.com'],
    },
  ];
  const context = {
    environment: 'dev',
    properties: { email: 'example@getunleash.ai' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should not enabled when email does not endsWith', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    { contextName: 'email', operator: 'STR_ENDS_WITH', values: ['@getunleash.ai'] },
  ];
  const context = {
    environment: 'dev',
    properties: { email: 'example@something-else.ai' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(false);
});

test('should be enabled when email contains', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [{ contextName: 'email', operator: 'STR_CONTAINS', values: ['some'] }];
  const context = {
    environment: 'dev',
    properties: { email: 'example-some@getunleash.ai' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when email does not contain (inverted)', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    { contextName: 'email', operator: 'STR_CONTAINS', values: ['some'], inverted: true },
  ];
  const context = {
    environment: 'dev',
    properties: { email: 'example@getunleash.ai' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when someVal "equals"', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [{ contextName: 'someVal', operator: 'NUM_EQ', value: 42 }];
  const context = {
    environment: 'dev',
    properties: { someVal: '42' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when someVal not "equals" (inverted)', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [{ contextName: 'someVal', operator: 'NUM_EQ', value: 42, inverted: true }];
  const context = {
    environment: 'dev',
    properties: { someVal: '44' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when someVal "equals" number', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [{ contextName: 'someVal', operator: 'NUM_EQ', value: 42 }];
  const context = {
    environment: 'dev',
    properties: { someVal: 42 },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when someVal "greater than" number', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [{ contextName: 'someVal', operator: 'NUM_GT', value: 42 }];
  const context = {
    environment: 'dev',
    properties: { someVal: '44' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be disable when someVal is not "greater than" number', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [{ contextName: 'someVal', operator: 'NUM_GT', value: 42 }];
  const context = {
    environment: 'dev',
    properties: { someVal: '42' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(false);
});

test('should be enabled when someVal "lower than" number', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [{ contextName: 'someVal', operator: 'NUM_LT', value: 42 }];
  const context = {
    environment: 'dev',
    properties: { someVal: '0' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when someVal "lower than or eq" number', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [{ contextName: 'someVal', operator: 'NUM_LTE', value: '42' }];
  const context = {
    environment: 'dev',
    properties: { someVal: 42 },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when someVal "greater than or eq" number', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [{ contextName: 'someVal', operator: 'NUM_GTE', value: '42' }];
  const context = {
    environment: 'dev',
    properties: { someVal: 42 },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when date is after', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    { contextName: 'someVal', operator: 'DATE_AFTER', value: '2022-01-29T13:00:00.000Z' },
  ];
  const context = {
    environment: 'dev',
    currentTime: new Date('2022-01-29T14:00:00.000Z'),
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be disabled when date is not after', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    { contextName: 'someVal', operator: 'DATE_AFTER', value: '2022-01-29T13:00:00.000Z' },
  ];
  const context = {
    environment: 'dev',
    currentTime: new Date('2022-01-27T14:00:00.000Z'),
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(false);
});

test('should be enabled when date is after implicit currentTime', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    { contextName: 'someVal', operator: 'DATE_AFTER', value: new Date('2022-01-28T14:00:00.000Z') },
  ];
  const context = {
    environment: 'dev',
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when date is before', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    {
      contextName: 'someVal',
      operator: 'DATE_BEFORE',
      value: new Date('2022-01-29T13:00:00.000Z'),
    },
  ];
  const context = {
    environment: 'dev',
    currentTime: new Date('2022-01-27T14:00:00.000Z'),
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be disabled when date is not before', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    {
      contextName: 'someVal',
      operator: 'DATE_BEFORE',
      value: new Date('2022-01-25T13:00:00.000Z'),
    },
  ];
  const context = {
    environment: 'dev',
    currentTime: new Date('2022-01-27T14:00:00.000Z'),
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(false);
});

test('should be enabled when semver eq', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [{ contextName: 'version', operator: 'SEMVER_EQ', value: '1.2.2' }];
  const context = {
    environment: 'dev',
    properties: { version: '1.2.2' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when semver lt', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [{ contextName: 'version', operator: 'SEMVER_LT', value: '1.2.2' }];
  const context = {
    environment: 'dev',
    properties: { version: '1.2.0' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when semver gt', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [{ contextName: 'version', operator: 'SEMVER_GT', value: '1.2.2' }];
  const context = {
    environment: 'dev',
    properties: { version: '1.2.5' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled when semver in range', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    { contextName: 'version', operator: 'SEMVER_GT', value: '1.2.2' },
    { contextName: 'version', operator: 'SEMVER_LT', value: '2.0.0' },
  ];

  for (const version of ['1.2.5', '1.2.5+1235', '1.2.5-rc.1']) {
    const context = {
      environment: 'dev',
      properties: { version },
    };

    // @ts-expect-error
    expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
  }
});

test('should be disabled when semver out of range', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    { contextName: 'version', operator: 'SEMVER_GT', value: '1.2.2' },
    { contextName: 'version', operator: 'SEMVER_LT', value: '2.0.0' },
  ];

  const context = {
    environment: 'dev',
    properties: { version: '1.2.0' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(false);
});

test('should be disabled when semver larger than range', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    { contextName: 'version', operator: 'SEMVER_GT', value: '1.2.2' },
    { contextName: 'version', operator: 'SEMVER_LT', value: '2.0.0' },
  ];

  const context = {
    environment: 'dev',
    properties: { version: '2.2.1' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(false);
});

test('should return false when passed an invalid semver', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [
    { contextName: 'version', operator: 'SEMVER_GT', value: 'not_a_semver' },
    { contextName: 'version', operator: 'SEMVER_LT', value: 'definitely_not_a_semver' },
  ];

  const context = {
    environment: 'dev',
    properties: { version: 'also_not_a_semver' },
  };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(false);
});

test('should NOT be enabled for unknown field', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [{ contextName: 'someField', operator: 'IN', values: ['s1'] }];
  const context = {};
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(false);
});

test('should be enabled for undefined field when NOT_IN', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [{ contextName: 'someField', operator: 'NOT_IN', values: ['s1'] }];
  const context = { properties: { someField: undefined } };
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should be enabled for missing field when NOT_IN', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [{ contextName: 'someField', operator: 'NOT_IN', values: ['s1'] }];
  const context = {};
  // @ts-expect-error
  expect(strategy.isEnabledWithConstraints(params, context, constraints)).toBe(true);
});

test('should gracefully handle version with custom toString that does not return string', () => {
  const strategy = new Strategy('test', true);
  const params = {};
  const constraints = [{ contextName: 'version', operator: 'SEMVER_EQ', value: '1.2.2' }];
  const context = {
    environment: 'dev',
    properties: { version: { toString: () => 122 } },
  };
  //@ts-expect-error
  expect(() => strategy.isEnabledWithConstraints(params, context, constraints)).not.toThrow();
});
