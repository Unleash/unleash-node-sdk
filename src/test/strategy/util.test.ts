import { expect, test } from 'vitest';

import { normalizedStrategyValue } from '../../strategy/util';

test('normalized values are the same across node, java, and go clients', () => {
  expect(normalizedStrategyValue('123', 'gr1')).toBe(73);
  expect(normalizedStrategyValue('999', 'groupX')).toBe(25);
});
