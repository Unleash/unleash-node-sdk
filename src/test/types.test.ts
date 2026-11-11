import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { expect, test } from 'vitest';

async function check(source: string): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'sdk-type-test-'));
  try {
    const filename = join(directory, 'consumer.ts');
    await writeFile(filename, source);
    const root = resolve('.');
    const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    const program = ts.createProgram([filename], {
      ...parsed.options,
      noEmit: true,
      rootDir: undefined,
      baseUrl: root,
      paths: { 'unleash-client': [join(root, 'src/index.ts')] },
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    const messages = ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    });
    expect(messages).toBe('');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('consumer types support structural strategies, arbitrary default names, and only the supported API', async () => {
  await check(`
    import { isEnabled, type Unleash, type Strategy, type UnleashConfig } from 'unleash-client';
    declare const sdk: Unleash;
    const plain: Strategy = { name: 'plain', isEnabled: (parameters, context) => parameters.userId === context.userId };
    class Independent implements Strategy { readonly name = 'independent'; isEnabled() { return true; } }
    const options: UnleashConfig = { appName: 'types', url: 'http://localhost/api/', strategies: [plain, new Independent()] };
    isEnabled('any-string');
    sdk.isEnabled('any-other-string', {}, true);
    sdk.isEnabled('anything', {}, () => false);
    // @ts-expect-error A strategy requires a name.
    const missing: Strategy = { isEnabled: () => true };
    // @ts-expect-error Callbacks must be synchronous booleans.
    const asyncStrategy: Strategy = { name: 'async', isEnabled: async () => true };
    // @ts-expect-error Strategy is type-only.
    new Strategy('old-class');
    // @ts-expect-error Repository injection is removed.
    options.repository = {};
    // @ts-expect-error Bootstrap override is removed.
    options.bootstrapOverride = false;
    // @ts-expect-error Inline bootstrap is a complete feature response, not the old data array.
    options.bootstrap = { data: [] };
    // @ts-expect-error Manual metrics recording is removed.
    sdk.count('flag', true);
    // @ts-expect-error Full-definition lookup is removed.
    sdk.getFeatureToggleDefinition('flag');
    // @ts-expect-error Runtime mode switching is removed.
    sdk.setExperimentalMode('streaming');
  `);
}, 10000);

test('flag-name augmentation restricts the singleton, both instance overloads, and direct class imports', async () => {
  await check(`
    import { isEnabled, type Name, type Unleash } from 'unleash-client';
    import type { Unleash as DirectUnleash } from '${resolve('src/unleash').replaceAll('\\', '/')}';
    declare module 'unleash-client' { interface UnleashTypes { flagNames: 'checkout' | 'search'; } }
    declare const sdk: Unleash;
    declare const direct: DirectUnleash;
    const name: Name = 'checkout';
    isEnabled(name);
    sdk.isEnabled('search', {}, true);
    sdk.isEnabled('checkout', {}, () => false);
    direct.isEnabled('checkout');
    // @ts-expect-error The singleton rejects typos.
    isEnabled('typo');
    // @ts-expect-error The boolean overload rejects typos.
    sdk.isEnabled('typo', {}, true);
    // @ts-expect-error The callback overload rejects typos.
    sdk.isEnabled('typo', {}, () => true);
    // @ts-expect-error Direct class imports share the configured name type.
    direct.isEnabled('typo');
    // @ts-expect-error A broad string cannot bypass the union.
    sdk.isEnabled('checkout' as string);
  `);
}, 10000);
