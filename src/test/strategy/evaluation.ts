import type { Context } from '../../context';
import { Strategy } from '../../strategy';
import { client, FakeFetcher, type Feature, feature, state } from '../fixtures';

// Reuse the original strategy cases through the SDK: no strategy logic lives here.
export async function strategyEvaluator(name: string, customResult?: boolean) {
  const fetcher = new FakeFetcher(state([]));
  const sdk = client({
    fetcher,
    strategies: customResult === undefined ? [] : [new Strategy(name, customResult)],
  });
  await sdk.start();
  let previous: string | undefined;
  return async (
    parameters: Record<string, string> = {},
    context: Context = {},
    constraints?: NonNullable<Feature['strategies']>[number]['constraints'],
  ): Promise<boolean> => {
    const definition = { name, parameters, constraints, variants: undefined };
    const serialized = JSON.stringify(definition);
    if (serialized !== previous) {
      await fetcher.publish(state([feature('strategy-test', { strategies: [definition] })]));
      previous = serialized;
    }
    return sdk.isEnabled('strategy-test', context);
  };
}
