import type { Context } from '../context';
import { Strategy } from './strategy';

export default class UserWithIdStrategy extends Strategy {
  constructor() {
    super('userWithId');
  }

  isEnabled(parameters: { userIds?: string }, context: Context) {
    const userIdList = parameters.userIds ? parameters.userIds.split(/\s*,\s*/) : [];
    return userIdList.includes(context.userId);
  }
}
