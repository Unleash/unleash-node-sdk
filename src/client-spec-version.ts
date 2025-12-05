import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import semver from 'semver';

const packageJsonPath = join(__dirname, '..', 'package.json');

const resolveSpecVersion = (): string | undefined => {
  try {
    const raw = readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const specDependencyVersion =
      packageJson.dependencies?.['@unleash/client-specification'] ??
      packageJson.devDependencies?.['@unleash/client-specification'];

    if (!specDependencyVersion) {
      return undefined;
    }

    if (semver.valid(specDependencyVersion)) {
      return specDependencyVersion;
    }

    if (semver.validRange(specDependencyVersion)) {
      return semver.minVersion(specDependencyVersion)?.version;
    }

    return semver.coerce(specDependencyVersion)?.version;
  } catch (_err: unknown) {
    // Ignore filesystem/parse errors and fall back to undefined.
    return undefined;
  }
};

export const supportedClientSpecVersion = resolveSpecVersion();
