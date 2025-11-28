import { expect, test } from 'vitest';

import UserWithIdStrategy from '../../strategy/user-with-id-strategy';

test('default strategy should have correct name', (t) => {
  const strategy = new UserWithIdStrategy();
  expect(strategy.name).toBe('userWithId');
  expect(strategy.isEnabled({}, {})).toBe(false);
});

test('user-with-id-strategy should be enabled for userId', (t) => {
  const strategy = new UserWithIdStrategy();
  const params = { userIds: '123' };
  const context = { userId: '123' };
  expect(strategy.isEnabled(params, context)).toBe(true);
});

test('user-with-id-strategy should be enabled for userId in list (spaced commas)', (t) => {
  const strategy = new UserWithIdStrategy();
  const params = { userIds: '123, 122, 12312312' };
  const context = { userId: '12312312' };
  expect(strategy.isEnabled(params, context)).toBe(true);
});

test('user-with-id-strategy should not be enabled for userId NOT in list', (t) => {
  const strategy = new UserWithIdStrategy();
  const params = { userIds: '123, 122, 122' };
  const context = { userId: '12' };
  expect(strategy.isEnabled(params, context)).toBe(false);
});

test('user-with-id-strategy should be enabled for userId in list', (t) => {
  const strategy = new UserWithIdStrategy();
  const params = { userIds: '123,122,12312312' };
  const context = { userId: '122' };
  expect(strategy.isEnabled(params, context)).toBe(true);
});
