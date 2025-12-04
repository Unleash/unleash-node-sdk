import type { Context } from '../context';
import { Strategy } from './strategy';

export default class GradualRolloutRandomStrategy extends Strategy {
  private randomGenerator: () => number = () => Math.floor(Math.random() * 100) + 1;

  constructor(randomGenerator?: () => number) {
    super('gradualRolloutRandom');
    this.randomGenerator = randomGenerator || this.randomGenerator;
  }

  isEnabled(parameters: { percentage?: number }, _context: Context) {
    const percentage: number = Number(parameters.percentage);
    const random: number = this.randomGenerator();
    return percentage >= random;
  }
}
