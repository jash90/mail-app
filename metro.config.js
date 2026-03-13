// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure Metro can resolve the buffer package
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  buffer: require.resolve('buffer/'),
};

// Allow .sql files to be imported as modules (needed for Drizzle ORM migrations)
config.resolver.sourceExts = [...(config.resolver.sourceExts || []), 'sql'];

module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
});
