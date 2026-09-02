import type { Context } from '../context';
import { Strategy } from './strategy';

export default class UserWithIdStrategy extends Strategy {
  private readonly userIdSets = new WeakMap<
    { userIds?: string },
    Set<string>
  >();

  constructor() {
    super('userWithId');
  }

  isEnabled(parameters: { userIds?: string }, context: Context) {
    if (
      typeof parameters.userIds !== 'string' ||
      parameters.userIds === '' ||
      context.userId == undefined
    ) {
      return false;
    }
    let userIdList = this.userIdSets.get(parameters);
    if (!userIdList) {
      userIdList = new Set(parameters.userIds.split(/\s*,\s*/));
      this.userIdSets.set(parameters, userIdList);
    }
    return userIdList.has(context.userId);
  }
}
