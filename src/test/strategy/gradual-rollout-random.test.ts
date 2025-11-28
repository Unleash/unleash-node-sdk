import { expect, test } from 'vitest';

import GradualRolloutRandomStrategy from '../../strategy/gradual-rollout-random';

test('should have correct name', () => {
  const strategy = new GradualRolloutRandomStrategy();
  expect(strategy.name).toBe('gradualRolloutRandom');
});

test('should only at most miss by one percent', () => {
  const strategy = new GradualRolloutRandomStrategy();

  const percentage = 25;
  const groupId = 'groupId';

  const rounds = 200000;
  let enabledCount = 0;

  for (let i = 0; i < rounds; i++) {
    const params = { percentage, groupId };
    const context = { sessionId: i };
    // @ts-expect-error
    if (strategy.isEnabled(params, context)) {
      enabledCount++;
    }
  }
  const actualPercentage = Math.round((enabledCount / rounds) * 100);
  const highMark = percentage + 1;
  const lowMark = percentage - 1;
  expect(actualPercentage).toBeGreaterThanOrEqual(lowMark);
  expect(actualPercentage).toBeLessThanOrEqual(highMark);
});

test('should be disabled when percentage is lower than random', () => {
  const strategy = new GradualRolloutRandomStrategy(() => 50);
  const params = { percentage: 20, groupId: 'test' };
  // @ts-expect-error we can't keep track of our types
  expect(strategy.isEnabled(params)).toBe(false);
});

test('should be disabled when percentage=0', () => {
  const strategy = new GradualRolloutRandomStrategy(() => 1);
  const params = { percentage: '0', groupId: 'test' };
  // @ts-expect-error
  expect(strategy.isEnabled(params)).toBe(false);
});

test('should be disabled when percentage=0 and random is not zero', () => {
  const strategy = new GradualRolloutRandomStrategy(() => 50);
  const params = { percentage: '0', groupId: 'test' };
  // @ts-expect-error
  expect(strategy.isEnabled(params)).toBe(false);
});

test('should be enabled when percentage is greater than random', () => {
  const strategy = new GradualRolloutRandomStrategy(() => 10);
  const params = { percentage: '20', groupId: 'test' };
  // @ts-expect-error
  expect(strategy.isEnabled(params)).toBe(true);
});

test('should be enabled when percentage=100', () => {
  const strategy = new GradualRolloutRandomStrategy(() => 90);
  const params = { percentage: '100', groupId: 'test' };
  // @ts-expect-error
  expect(strategy.isEnabled(params)).toBe(true);
});

test('should be enabled when percentage and random are the same', () => {
  const strategy = new GradualRolloutRandomStrategy(() => 55);
  const params = { percentage: '55', groupId: 'test' };
  // @ts-expect-error
  expect(strategy.isEnabled(params)).toBe(true);
});
