import type { Context } from '../context';
import { Strategy } from './strategy';
import { normalizedStrategyValue } from './util';

export default class GradualRolloutSessionIdStrategy extends Strategy {
  constructor() {
    super('gradualRolloutSessionId');
  }

  isEnabled(parameters: { percentage?: number; groupId?: string }, context: Context) {
    const { sessionId } = context;
    if (!sessionId) {
      return false;
    }

    const percentage = Number(parameters.percentage);
    const groupId = parameters.groupId || '';

    const normalizedId = normalizedStrategyValue(sessionId, groupId);

    return percentage > 0 && normalizedId <= percentage;
  }
}
