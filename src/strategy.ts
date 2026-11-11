import type { Context } from './context';

export interface Strategy {
  readonly name: string;
  isEnabled(parameters: Record<string, unknown>, context: Context): boolean;
}
