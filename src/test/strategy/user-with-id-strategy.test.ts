import test from '../ava-shim';

import UserWithIdStrategy from '../../strategy/user-with-id-strategy';

test('default strategy should have correct name', (t) => {
  const strategy = new UserWithIdStrategy();
  t.deepEqual(strategy.name, 'userWithId');
  t.false(strategy.isEnabled({}, {}));
});

test('user-with-id-strategy should be enabled for userId', (t) => {
  const strategy = new UserWithIdStrategy();
  const params = { userIds: '123' };
  const context = { userId: '123' };
  t.true(strategy.isEnabled(params, context));
});

test('user-with-id-strategy should be enabled for userId in list (spaced commas)', (t) => {
  const strategy = new UserWithIdStrategy();
  const params = { userIds: '123, 122, 12312312' };
  const context = { userId: '12312312' };
  t.true(strategy.isEnabled(params, context));
});

test('user-with-id-strategy should not be enabled for userId NOT in list', (t) => {
  const strategy = new UserWithIdStrategy();
  const params = { userIds: '123, 122, 122' };
  const context = { userId: '12' };
  t.false(strategy.isEnabled(params, context));
});

test('user-with-id-strategy should be enabled for userId in list', (t) => {
  const strategy = new UserWithIdStrategy();
  const params = { userIds: '123,122,12312312' };
  const context = { userId: '122' };
  t.true(strategy.isEnabled(params, context));
});
