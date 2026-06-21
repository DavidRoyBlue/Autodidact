module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      [
        '@tamagui/babel-plugin',
        {
          components: ['tamagui'],
          config: './src/design/config.ts',
          logTimings: true,
          disableExtraction: process.env.NODE_ENV !== 'production',
        },
      ],
    ],
  };
};
