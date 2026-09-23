module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo auto-detects react-native-worklets (installed as
    // react-native-reanimated's runtime peer) and adds its plugin — it must
    // run last among any Babel plugins, which the preset already guarantees.
    presets: ['babel-preset-expo'],
  };
};
