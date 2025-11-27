import test from '../test-shim';

import { normalizedStrategyValue } from '../../strategy/util';

test('normalized values are the same across node, java, and go clients', (t) => {
  t.is(normalizedStrategyValue('123', 'gr1'), 73);
  t.is(normalizedStrategyValue('999', 'groupX'), 25);
});
