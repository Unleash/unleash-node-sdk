import type { Context } from '../context';
import { resolveContextValue } from '../helpers';
import { Strategy } from './strategy';
import { normalizedStrategyValue } from './util';

const STICKINESS = {
  default: 'default',
  random: 'random',
};

export default class FlexibleRolloutStrategy extends Strategy {
  private randomGenerator: () => string = () => `${Math.round(Math.random() * 10000) + 1}`;

  constructor(randomGenerator?: () => string) {
    super('flexibleRollout');
    if (randomGenerator) {
      this.randomGenerator = randomGenerator;
    }
  }

  resolveStickiness(stickiness: string, context: Context): string | undefined {
    switch (stickiness) {
      case STICKINESS.default:
        return context.userId || context.sessionId || this.randomGenerator();
      case STICKINESS.random:
        return this.randomGenerator();
      default:
        return resolveContextValue(context, stickiness);
    }
  }

  isEnabled(
    parameters: { groupId?: string; rollout?: number; stickiness?: string },
    context: Context,
  ) {
    const groupId = parameters.groupId || context.featureToggle || '';
    const percentage = Number(parameters.rollout);
    const stickiness: string = parameters.stickiness || STICKINESS.default;
    const stickinessId = this.resolveStickiness(stickiness, context);

    if (!stickinessId) {
      return false;
    }
    const normalizedUserId = normalizedStrategyValue(stickinessId, groupId);
    return percentage > 0 && normalizedUserId <= percentage;
  }
}
