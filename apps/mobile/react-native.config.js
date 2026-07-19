// Autolinking override for the pnpm monorepo: when the RN gradle plugin runs the
// expo-modules-autolinking config command from the generated android/ dir, expo's own
// react-native.config.js fails to load and the resolver falls back to the library
// NAMESPACE ("expo.core") for the import — producing the uncompilable
// `import expo.core.ExpoModulesPackage;` (EAS builds 0f3cdd0d/fa4baf49). Pin the real one.
module.exports = {
  dependencies: {
    expo: {
      platforms: {
        android: { packageImportPath: 'import expo.modules.ExpoModulesPackage;' },
      },
    },
  },
};
