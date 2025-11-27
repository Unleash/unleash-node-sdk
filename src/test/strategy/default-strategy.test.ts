import test from '../test-shim';

import DefaultStrategy from '../../strategy/default-strategy';

test('default strategy should be enabled', (t) => {
  const strategy = new DefaultStrategy();
  t.true(strategy.isEnabled());
});

test('default strategy should have correct name', (t) => {
  const strategy = new DefaultStrategy();
  t.true(strategy.name === 'default');
});
