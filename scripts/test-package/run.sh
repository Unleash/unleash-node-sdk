#!/bin/bash
set -e

echo -e "\nTesting that the package can be installed in another project, loaded with CommonJS and compiled with TypeScript without errors"

TEST_DIR="test-package"
mkdir "$TEST_DIR"

cp scripts/test-package/test-tsconfig.json "$TEST_DIR/tsconfig.json"
cp scripts/test-package/test-package.json "$TEST_DIR/package.json"
cd "$TEST_DIR"
npm install --install-links
mkdir src
echo -e "import { Unleash } from 'unleash-client';\nvoid Unleash;\nconsole.log('Hello world');" > src/index.ts
./node_modules/.bin/tsc -b tsconfig.json
cat <<EOF > test-cjs-interop.cjs
const fs = require('node:fs');

const packageJsonPath = require.resolve('unleash-client/package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
if (packageJson.type !== 'commonjs') {
  throw new Error(
    "Expected unleash-client package.json type to be 'commonjs', got '" + packageJson.type + "'",
  );
}

const unleashClient = require('unleash-client');
if (!('Unleash' in unleashClient)) {
  throw new Error('Expected unleash-client to expose Unleash via CommonJS require()');
}

console.log('CommonJS load works');
EOF

cjs_output="$(node test-cjs-interop.cjs 2>&1)"
if [ "$cjs_output" != "CommonJS load works" ]; then
  echo "CommonJS smoke test failed" >&2
  echo "$cjs_output"
  (cd .. && rm -rf "$TEST_DIR")
  exit 1
fi

if [ "$(node . 2>&1)" = "Hello world" ]; then
  echo "Output is correct"
  (cd .. && rm -rf "$TEST_DIR")
else
  echo "Output is incorrect" >&2
  echo $(node . 2>&1)
  (cd .. && rm -rf "$TEST_DIR")
  exit 1
fi
