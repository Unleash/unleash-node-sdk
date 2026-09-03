import { expect, test, vi } from 'vitest';

import UserWithIdStrategy from '../../strategy/user-with-id-strategy';

test('default strategy should have correct name', () => {
  const strategy = new UserWithIdStrategy();
  expect(strategy.name).toBe('userWithId');
  expect(strategy.isEnabled({}, {})).toBe(false);
});

test('user-with-id-strategy should be enabled for userId', () => {
  const strategy = new UserWithIdStrategy();
  const params = { userIds: '123' };
  const context = { userId: '123' };
  expect(strategy.isEnabled(params, context)).toBe(true);
});

test('user-with-id-strategy should be enabled for userId in list (spaced commas)', () => {
  const strategy = new UserWithIdStrategy();
  const params = { userIds: '123, 122, 12312312' };
  const context = { userId: '12312312' };
  expect(strategy.isEnabled(params, context)).toBe(true);
});

test('user-with-id-strategy should not be enabled for userId NOT in list', () => {
  const strategy = new UserWithIdStrategy();
  const params = { userIds: '123, 122, 122' };
  const context = { userId: '12' };
  expect(strategy.isEnabled(params, context)).toBe(false);
});

test('user-with-id-strategy should be enabled for userId in list', () => {
  const strategy = new UserWithIdStrategy();
  const params = { userIds: '123,122,12312312' };
  const context = { userId: '122' };
  expect(strategy.isEnabled(params, context)).toBe(true);
});

test('user-with-id-strategy should cache parsed userIds for same parameters reference', () => {
  const strategy = new UserWithIdStrategy();
  const params = { userIds: '123, 122, 12312312' };
  const splitSpy = vi.spyOn(String.prototype, 'split');

  expect(strategy.isEnabled(params, { userId: '123' })).toBe(true);
  expect(strategy.isEnabled(params, { userId: '122' })).toBe(true);
  expect(strategy.isEnabled(params, { userId: '999' })).toBe(false);

  expect(splitSpy).toHaveBeenCalledTimes(1);
  splitSpy.mockRestore();
});

test('rebuilds the cache when userIds changes', () => {
  const strategy = new UserWithIdStrategy();
  const params = { userIds: '123' };

  expect(strategy.isEnabled(params, { userId: '123' })).toBe(true);

  params.userIds = '456';

  expect(strategy.isEnabled(params, { userId: '456' })).toBe(true);
  expect(strategy.isEnabled(params, { userId: '123' })).toBe(false);
});
