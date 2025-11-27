import { test } from 'vitest';

import GradualRolloutSessionIdStrategy from '../../strategy/gradual-rollout-session-id';
import { normalizedStrategyValue } from '../../strategy/util';

test('gradual-rollout-user-id strategy should have correct name', (t) => {
  const strategy = new GradualRolloutSessionIdStrategy();
  t.deepEqual(strategy.name, 'gradualRolloutSessionId');
});

test('should be enabled when percentage is 100', (t) => {
  const strategy = new GradualRolloutSessionIdStrategy();
  const params = { percentage: '100', groupId: 'gr1' };
  const context = { sessionId: '123' };
  t.true(strategy.isEnabled(params, context));
});

test('should be disabled when percentage is 0', (t) => {
  const strategy = new GradualRolloutSessionIdStrategy();
  const params = { percentage: '0', groupId: 'gr1' };
  const context = { sessionId: '123' };
  t.false(strategy.isEnabled(params, context));
});

test('should be enabled when percentage is exactly same', (t) => {
  const strategy = new GradualRolloutSessionIdStrategy();
  const sessionId = '123123';
  const groupId = 'group1';

  const percentage = normalizedStrategyValue(sessionId, groupId);
  const params = { percentage: `${percentage}`, groupId };
  const context = { sessionId };
  t.true(strategy.isEnabled(params, context));
});

test('should be disabled when percentage is just below required value', (t) => {
  const strategy = new GradualRolloutSessionIdStrategy();
  const sessionId = '123123';
  const groupId = 'group1';

  const percentage = normalizedStrategyValue(sessionId, groupId) - 1;
  const params = { percentage: `${percentage}`, groupId };
  const context = { sessionId };
  t.false(strategy.isEnabled(params, context));
});

test('should only at most miss by one percent', (t) => {
  const strategy = new GradualRolloutSessionIdStrategy();

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

  t.true(lowMark <= actualPercentage);
  t.true(highMark >= actualPercentage);
});
