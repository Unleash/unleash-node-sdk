import { expect, test } from 'vitest';

import DefaultStrategy from '../../strategy/default-strategy';

test('default strategy should be enabled', () => {
  const strategy = new DefaultStrategy();
  expect(strategy.isEnabled()).toBe(true);
});

test('default strategy should have correct name', () => {
  const strategy = new DefaultStrategy();
  expect(strategy.name).toBe('default');
});
