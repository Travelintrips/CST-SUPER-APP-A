const { getDefaultConfig } = require("expo/metro-config");
const { mergeConfig } = require("metro-config");

const defaultConfig = getDefaultConfig(__dirname);

const config = {
  resolver: {
    blockList: [
      /expo-notifications_tmp_[^/]+\/.*/,
    ],
  },
};

module.exports = mergeConfig(defaultConfig, config);
