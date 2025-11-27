/* eslint-disable import/no-extraneous-dependencies */
import { test } from 'vitest';
import * as sinon from 'sinon';

import FlexibleRolloutStrategy from '../../strategy/flexible-rollout-strategy';

test('should have correct name', (t) => {
  const strategy = new FlexibleRolloutStrategy();
  t.deepEqual(strategy.name, 'flexibleRollout');
});

test('should NOT be enabled for userId=61 and rollout=9', (t) => {
  const strategy = new FlexibleRolloutStrategy();
  const params = { rollout: 9, stickiness: 'default', groupId: 'Demo' };
  const context = { userId: '61', application: 'web' };
  t.false(strategy.isEnabled(params, context));
});

test('should be enabled for userId=61 and rollout=10', (t) => {
  const strategy = new FlexibleRolloutStrategy();
  const params = { rollout: '10', stickiness: 'default', groupId: 'Demo' };
  const context = { userId: '61', application: 'web' };
  t.true(strategy.isEnabled(params, context));
});

test('should be disabled when stickiness=userId and userId not on context', (t) => {
  const strategy = new FlexibleRolloutStrategy();
  const params = { rollout: '100', stickiness: 'userId', groupId: 'Demo' };
  const context = {};
  t.false(strategy.isEnabled(params, context));
});

test('should fallback to random if stickiness=default and empty context', (t) => {
  const randomGenerator = sinon.fake.returns('42'); // eslint-disable-line import/namespace

  const strategy = new FlexibleRolloutStrategy(randomGenerator);
  const params = { rollout: '100', stickiness: 'default', groupId: 'Demo' };
  const context = {};

  t.true(strategy.isEnabled(params, context));
  t.true(randomGenerator.called);
});

test('should NOT be enabled for rollout=10% when userId is 123', (t) => {
  const strategy = new FlexibleRolloutStrategy();
  const params = { rollout: 10, stickiness: 'default', groupId: 'toggleName' };
  const context = { environment: 'dev', userId: '123' };
  t.false(strategy.isEnabled(params, context));
});

test('should be disabled when stickiness=customerId and customerId not found on context', (t) => {
  const strategy = new FlexibleRolloutStrategy();
  const params = {
    rollout: '100',
    stickiness: 'customerId',
    groupId: 'Demo',
  };
  const context = {};
  t.false(strategy.isEnabled(params, context));
});

test('should be enabled when stickiness=customerId and customerId=61', (t) => {
  const strategy = new FlexibleRolloutStrategy();
  const params = {
    rollout: '100',
    stickiness: 'customerId',
    groupId: 'Demo',
  };
  const context = { customerId: 61 };
  t.true(strategy.isEnabled(params, context));
});
