import { Unleash } from '../unleash';

export class UnleashMetricClient extends Unleash {
  constructor(...args: ConstructorParameters<typeof Unleash>) {
    super(...args);
    console.warn(
      'UnleashMetricClient is deprecated. ' +
        'This functionality now lives in UnleashClient. ' +
        'This class will be removed in the next major release.',
    );
  }
}
