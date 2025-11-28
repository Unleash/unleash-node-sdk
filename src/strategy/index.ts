import ApplicationHostnameStrategy from './application-hostname-strategy';
import DefaultStrategy from './default-strategy';
import FlexibleRolloutStrategy from './flexible-rollout-strategy';
import GradualRolloutRandomStrategy from './gradual-rollout-random';
import GradualRolloutSessionIdStrategy from './gradual-rollout-session-id';
import GradualRolloutUserIdStrategy from './gradual-rollout-user-id';
import RemoteAddressStrategy from './remote-addresss-strategy';
import type { Strategy } from './strategy';
import UserWithIdStrategy from './user-with-id-strategy';

export { Strategy, StrategyTransportInterface } from './strategy';

export const defaultStrategies: Array<Strategy> = [
  new DefaultStrategy(),
  new ApplicationHostnameStrategy(),
  new GradualRolloutRandomStrategy(),
  new GradualRolloutUserIdStrategy(),
  new GradualRolloutSessionIdStrategy(),
  new UserWithIdStrategy(),
  new RemoteAddressStrategy(),
  new FlexibleRolloutStrategy(),
];
