import { expect, test } from 'vitest';
import { strategyEvaluator } from './evaluation';

test('should only at most miss by one percent', async () => {
  const evaluate = await strategyEvaluator('gradualRolloutRandom');

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

test('should be disabled when percentage=0', async () => {
  const evaluate = await strategyEvaluator('gradualRolloutRandom');
  const params = { percentage: '0', groupId: 'test' };
  expect(await evaluate(params)).toBe(false);
});

test('should be disabled when percentage=0 and random is not zero', async () => {
  const evaluate = await strategyEvaluator('gradualRolloutRandom');
  const params = { percentage: '0', groupId: 'test' };
  expect(await evaluate(params)).toBe(false);
});

test('should be enabled when percentage=100', async () => {
  const evaluate = await strategyEvaluator('gradualRolloutRandom');
  const params = { percentage: '100', groupId: 'test' };
  expect(await evaluate(params)).toBe(true);
});
