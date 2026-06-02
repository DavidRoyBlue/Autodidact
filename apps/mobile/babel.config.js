module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        '@tamagui/babel-plugin',
        {
          components: ['tamagui'],
          config: './src/design/config.ts',
          logTimings: true,
          // Disable the optimizing compiler unless this is an explicit production
          // build. The previous `=== 'development'` check evaluated false in Metro's
          // transform workers (NODE_ENV is often unset there), so extraction ran in
          // dev and produced "No component given to styled()" / "skipped loading
          // module". `!== 'production'` reliably disables it for dev/test.
          disableExtraction: process.env.NODE_ENV !== 'production',
        },
      ],
    ],
  };
};
