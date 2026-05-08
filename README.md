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

## Streaming beta

Streaming support is available as a beta feature for non-production customer environments. It is documented and recommended so you can test and validate the behavior early, but it is not recommended for production customer traffic yet.

Streaming only works when the SDK connects to Unleash Enterprise Edge. It is not supported against Unleash Open Source, the regular Unleash API, or non-Enterprise Edge endpoints. Point the SDK `url` at the Enterprise Edge API root and use a valid Edge client token.

Use the Enterprise Edge `/api/` URL as the SDK base URL:

```txt
https://mycompany.example/edge/api/
```

The trailing slash is recommended for clarity. If you configure `https://mycompany.example/edge/api` without the trailing slash, the SDK normalizes it to `https://mycompany.example/edge/api/` before connecting. The streaming connection is then opened against `https://mycompany.example/edge/api/client/streaming`.

Enable streaming with `experimentalMode: { type: 'streaming' }`:

```js
import { startUnleash } from 'unleash-client';

const unleash = await startUnleash({
  url: 'https://mycompany.example/edge/api/',
  appName: 'my-node-service',
  instanceId: process.env.UNLEASH_INSTANCE_ID,
  customHeaders: {
    Authorization: process.env.UNLEASH_API_KEY,
  },
  experimentalMode: {
    type: 'streaming',
  },
});

const enabled = unleash.isEnabled('my-feature', {
  userId: 'beta-user',
});
```

Streaming failure handling is automatic:

- If the connection drops or receives transient network errors, the SDK reconnects with backoff.
- If the stream fails repeatedly, the SDK emits a warning and falls back to polling against the same Edge API URL.
- If Enterprise Edge explicitly asks the SDK to use polling, the SDK switches from streaming to polling automatically.
- If a stream event cannot be processed, the SDK emits a warning and reconnects to request a full rehydration, so it does not continue from a potentially incomplete event sequence.
- During reconnects or polling fallback, flag evaluation continues from the SDK's latest known data. If the SDK has not synchronized any data yet, normal default evaluation behavior applies.

You can observe these transitions with SDK events:

```js
unleash.on('warn', (message) => {
  console.warn(message);
});

unleash.on('mode', ({ from, to }) => {
  console.log(`Unleash SDK switched from ${from} to ${to}`);
});
```

For a complete runnable example, see [`examples/streaming.js`](examples/streaming.js).

## Contributing

### Local development

Clone the repository and install dependencies:

```bash
git clone https://github.com/Unleash/unleash-node-sdk.git
cd unleash-node-sdk
yarn install
```

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
