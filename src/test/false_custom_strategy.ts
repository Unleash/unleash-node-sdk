import type { Strategy } from '../';

export default class CustomFalseStrategy implements Strategy {
  readonly name = 'custom-false';

  isEnabled() {
    return false;
  }
}
