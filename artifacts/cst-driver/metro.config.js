const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.blockList = /expo-notifications_tmp_[^/]+\/.*/;

module.exports = config;
