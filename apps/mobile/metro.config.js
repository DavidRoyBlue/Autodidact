// Metro configuration for the Expo app.
//
// Why this file exists: tamagui v2 (2.0.0-rc.x) ships a package `exports` map —
// its named exports (Stack, styled, …) live behind the `react-native` condition
// (dist/esm/index.native.js), and the bare `main` field isn't a valid subpath in
// that map. Expo SDK 52's Metro does NOT honor package `exports` by default, so
// without this `import { Stack } from 'tamagui'` resolves to `undefined` and
// `styled(Stack, …)` throws "No component given to styled()". Enabling package
// exports makes Metro use the conditional `exports` map and resolve correctly.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;

module.exports = config;
