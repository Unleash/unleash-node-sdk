import type { Strategy } from '..';

export default class CustomStrategy implements Strategy {
  readonly name = 'custom';

  isEnabled() {
    return true;
  }
}
