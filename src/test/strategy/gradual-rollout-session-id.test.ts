import { expect, test } from 'vitest';
import { strategyEvaluator } from './evaluation';

test('should be enabled when percentage is 100', async () => {
  const evaluate = await strategyEvaluator('gradualRolloutSessionId');
  const params = { percentage: '100', groupId: 'gr1' };
  const context = { sessionId: '123' };
  expect(await evaluate(params, context)).toBe(true);
});

test('should be disabled when percentage is 0', async () => {
  const evaluate = await strategyEvaluator('gradualRolloutSessionId');
  const params = { percentage: '0', groupId: 'gr1' };
  const context = { sessionId: '123' };
  expect(await evaluate(params, context)).toBe(false);
});

test('should be enabled when percentage is exactly same', async () => {
  const evaluate = await strategyEvaluator('gradualRolloutSessionId');
  const sessionId = '123123';
  const groupId = 'group1';

  const percentage = 33;
  const params = { percentage: `${percentage}`, groupId };
  const context = { sessionId };
  expect(await evaluate(params, context)).toBe(true);
});

test('should be disabled when percentage is just below required value', async () => {
  const evaluate = await strategyEvaluator('gradualRolloutSessionId');
  const sessionId = '123123';
  const groupId = 'group1';

  const percentage = 33 - 1;
  const params = { percentage: `${percentage}`, groupId };
  const context = { sessionId };
  expect(await evaluate(params, context)).toBe(false);
});

test('should only at most miss by one percent', async () => {
  const evaluate = await strategyEvaluator('gradualRolloutSessionId');

  const percentage = 25;
  const groupId = 'groupId';

  const rounds = 200000;
  let enabledCount = 0;

  for (let i = 0; i < rounds; i++) {
    const params = { percentage: String(percentage), groupId };
    const context = { sessionId: String(i) };
    if (await evaluate(params, context)) {
      enabledCount++;
    }
  }
  const actualPercentage = Math.round((enabledCount / rounds) * 100);
  const highMark = percentage + 1;
  const lowMark = percentage - 1;
  expect(actualPercentage).toBeGreaterThanOrEqual(lowMark);
  expect(actualPercentage).toBeLessThanOrEqual(highMark);
});
