import { expect, test, vi } from 'vitest';
import FlexibleRolloutStrategy from '../../strategy/flexible-rollout-strategy';

test('should have correct name', (t) => {
  const strategy = new FlexibleRolloutStrategy();
  expect(strategy.name).toBe('flexibleRollout');
});

test('should NOT be enabled for userId=61 and rollout=9', (t) => {
  const strategy = new FlexibleRolloutStrategy();
  const params = { rollout: 9, stickiness: 'default', groupId: 'Demo' };
  const context = { userId: '61', application: 'web' };
  expect(strategy.isEnabled(params, context)).toBe(false);
});

test('should be enabled for userId=61 and rollout=10', (t) => {
  const strategy = new FlexibleRolloutStrategy();
  const params = { rollout: '10', stickiness: 'default', groupId: 'Demo' };
  const context = { userId: '61', application: 'web' };
  expect(strategy.isEnabled(params, context)).toBe(true);
});

test('should be disabled when stickiness=userId and userId not on context', (t) => {
  const strategy = new FlexibleRolloutStrategy();
  const params = { rollout: '100', stickiness: 'userId', groupId: 'Demo' };
  const context = {};
  expect(strategy.isEnabled(params, context)).toBe(false);
});

test('should fallback to random if stickiness=default and empty context', (t) => {
  const randomGenerator = vi.fn(() => '42');

  const strategy = new FlexibleRolloutStrategy(randomGenerator);
  const params = { rollout: '100', stickiness: 'default', groupId: 'Demo' };
  const context = {};

  expect(strategy.isEnabled(params, context)).toBe(true);
  expect(randomGenerator).toHaveBeenCalled();
});

test('should NOT be enabled for rollout=10% when userId is 123', (t) => {
  const strategy = new FlexibleRolloutStrategy();
  const params = { rollout: 10, stickiness: 'default', groupId: 'toggleName' };
  const context = { environment: 'dev', userId: '123' };
  expect(strategy.isEnabled(params, context)).toBe(false);
});

test('should be disabled when stickiness=customerId and customerId not found on context', (t) => {
  const strategy = new FlexibleRolloutStrategy();
  const params = {
    rollout: '100',
    stickiness: 'customerId',
    groupId: 'Demo',
  };
  const context = {};
  expect(strategy.isEnabled(params, context)).toBe(false);
});

test('should be enabled when stickiness=customerId and customerId=61', (t) => {
  const strategy = new FlexibleRolloutStrategy();
  const params = {
    rollout: '100',
    stickiness: 'customerId',
    groupId: 'Demo',
  };
  const context = { customerId: 61 };
  expect(strategy.isEnabled(params, context)).toBe(true);
});
