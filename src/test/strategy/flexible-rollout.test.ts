import { expect, test } from 'vitest';
import { strategyEvaluator } from './evaluation';

test('should NOT be enabled for userId=61 and rollout=9', async () => {
  const evaluate = await strategyEvaluator('flexibleRollout');
  const params = { rollout: '9', stickiness: 'default', groupId: 'Demo' };
  const context = { userId: '61', application: 'web' };
  expect(await evaluate(params, context)).toBe(false);
});

test('should be enabled for userId=61 and rollout=10', async () => {
  const evaluate = await strategyEvaluator('flexibleRollout');
  const params = { rollout: '10', stickiness: 'default', groupId: 'Demo' };
  const context = { userId: '61', application: 'web' };
  expect(await evaluate(params, context)).toBe(true);
});

test('should be disabled when stickiness=userId and userId not on context', async () => {
  const evaluate = await strategyEvaluator('flexibleRollout');
  const params = { rollout: '100', stickiness: 'userId', groupId: 'Demo' };
  const context = {};
  expect(await evaluate(params, context)).toBe(false);
});

test('should fallback to random if stickiness=default and empty context', async () => {
  const evaluate = await strategyEvaluator('flexibleRollout');
  const params = { rollout: '100', stickiness: 'default', groupId: 'Demo' };
  const context = {};

  expect(await evaluate(params, context)).toBe(true);
});

test('should NOT be enabled for rollout=10% when userId is 123', async () => {
  const evaluate = await strategyEvaluator('flexibleRollout');
  const params = { rollout: '10', stickiness: 'default', groupId: 'toggleName' };
  const context = { environment: 'dev', userId: '123' };
  expect(await evaluate(params, context)).toBe(false);
});

test('should be disabled when stickiness=customerId and customerId not found on context', async () => {
  const evaluate = await strategyEvaluator('flexibleRollout');
  const params = {
    rollout: '100',
    stickiness: 'customerId',
    groupId: 'Demo',
  };
  const context = {};
  expect(await evaluate(params, context)).toBe(false);
});

test('should be enabled when stickiness=customerId and customerId=61', async () => {
  const evaluate = await strategyEvaluator('flexibleRollout');
  const params = {
    rollout: '100',
    stickiness: 'customerId',
    groupId: 'Demo',
  };
  const context = { customerId: 61 };
  expect(await evaluate(params, context)).toBe(true);
});
