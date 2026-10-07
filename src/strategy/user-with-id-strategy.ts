import type { Context } from '../context';
import { Strategy } from './strategy';

export default class UserWithIdStrategy extends Strategy {
  private readonly cache = new WeakMap<
    { userIds?: string },
    { userIds: string; ids: Set<string> }
  >();

  constructor() {
    super('userWithId');
  }

  isEnabled(parameters: { userIds?: string }, context: Context) {
    const { userIds } = parameters;
    if (typeof userIds !== 'string' || userIds === '' || context.userId === undefined) {
      return false;
    }
    let cached = this.cache.get(parameters);
    if (cached?.userIds !== userIds) {
      cached = { userIds, ids: new Set(userIds.split(/\s*,\s*/)) };
      this.cache.set(parameters, cached);
    }
    return cached.ids.has(context.userId);
  }
}
