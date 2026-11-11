[![Unleash node SDK on npm](https://img.shields.io/npm/v/unleash-client)](https://www.npmjs.com/package/unleash-client)
![npm downloads](https://img.shields.io/npm/dm/unleash-client)
[![Build Status](https://github.com/Unleash/unleash-node-sdk/actions/workflows/build-and-test.yaml/badge.svg)](https://github.com/Unleash/unleash-node-sdk/actions)
[![Coverage Status](https://coveralls.io/repos/github/Unleash/unleash-node-sdk/badge.svg?branch=main)](https://coveralls.io/github/Unleash/unleash-node-sdk?branch=main)

# unleash-node-sdk

The official Unleash SDK for Node.js. This SDK lets you evaluate feature flags in your Node.js services and applications.

[Unleash](https://github.com/Unleash/unleash) is an open-source feature management platform. You can use this SDK with [Unleash Enterprise](https://www.getunleash.io/pricing) or [Unleash Open Source](https://github.com/Unleash/unleash).

For complete documentation, see the [Node.js SDK reference](https://docs.getunleash.io/sdks/node).

## Requirements

- Node.js 20 or later

## Installation

```bash
npm install unleash-client
```

## Quick start

The following example initializes the SDK and checks a feature flag:

```js
import { startUnleash } from 'unleash-client';

const unleash = await startUnleash({
  url: 'https://<your-unleash-instance>/api/',
  appName: 'my-node-name',
  customHeaders: { Authorization: '<your-backend-token>' },
});

const enabled = unleash.isEnabled('my-feature');
if (enabled) {
  // new behavior
}

const variant = unleash.getVariant('checkout-experiment');
if (variant.name === 'blue') {
  // blue variant behavior
} else if (variant.name === 'green') {
  // green variant behavior
}
```

## Readiness and bootstrap

The startup events describe different states:

| Event | Meaning |
| --- | --- |
| `ready` | The first usable feature state has loaded from bootstrap, backup storage, or a live update. |
| `synchronized` | The first live update from the API or an injected fetcher has been applied. |
| `changed` | A live state update has been applied. Its payload contains feature summaries. |

When bootstrap is the first source to make the client ready, it emits `ready`.
Applying bootstrap emits neither `changed` nor `synchronized`, and does not write
the bootstrap snapshot to storage. To use bootstrap again after
a restart, provide it again; a backup saved from a live update can also provide
initial state. Live updates take precedence over bootstrap, and bootstrap takes
precedence over backup.

`startUnleash()` waits for `synchronized`. It remains pending if only bootstrap or
backup state is available and no live update arrives. To start using bootstrap
state as soon as it is ready, construct a client and wait for `ready` instead:

```js
import { once } from 'node:events';
import { Unleash } from 'unleash-client';

const unleash = new Unleash({
  url: 'https://<your-unleash-instance>/api/',
  appName: 'my-node-name',
  customHeaders: { Authorization: '<your-backend-token>' },
  bootstrap: {
    features: {
      version: 2,
      features: [
        { name: 'my-feature', enabled: true, strategies: [{ name: 'default' }] },
      ],
    },
  },
});

await once(unleash, 'ready');
const enabled = unleash.isEnabled('my-feature');
```

## TypeScript flag names

By default, `isEnabled()` accepts any string. To restrict feature names, augment
`UnleashTypes` in a TypeScript module included by your project:

```ts
import { isEnabled } from 'unleash-client';

declare module 'unleash-client' {
  interface UnleashTypes {
    flagNames: 'checkout' | 'search';
  }
}

isEnabled('checkout'); // Allowed
isEnabled('checkuot'); // TypeScript error
```

The restriction applies to both the package-level `isEnabled()` function and
`unleash.isEnabled()` on SDK instances. It only affects compile-time checking;
runtime evaluation is unchanged.

## Contributing

### Local development

Clone the repository and install dependencies:

```bash
git clone https://github.com/Unleash/unleash-node-sdk.git
cd unleash-node-sdk
yarn install
yarn prepare
```

`yarn prepare` sets up git hooks and builds the project. It doesn't run automatically on install because dependency lifecycle scripts are disabled (see `.yarnrc`) as a supply-chain hardening measure.

The [client specification](https://github.com/Unleash/client-specification) test data is included as a dev dependency (`@unleash/client-specification`). It defines a shared contract that all Unleash SDKs test against.

### Running tests

```bash
yarn test        # run tests
yarn coverage    # run tests with coverage
```

### Benchmarking

Run the feature flag evaluation benchmark:

```bash
yarn bench:isEnabled
```

### Code style and formatting

The project uses [Biome](https://biomejs.dev/) for linting and formatting:

```bash
yarn lint        # check for issues
yarn lint:fix    # auto-fix issues
```

### Building

```bash
yarn build       # compile TypeScript to lib/
```

## License

Apache-2.0
