const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

const projectRoot = path.resolve(__dirname);
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch only the specific workspace directories cst-driver actually needs:
//   - workspaceRoot/node_modules : pnpm-hoisted packages
//   - workspaceRoot/lib          : shared workspace packages (@workspace/*)
//
// Do NOT watch the entire workspaceRoot.  That would include .local/skills/
// which contains transient temp directories that appear and disappear during
// agent sessions.  Metro's FallbackWatcher calls fs.watch() on every directory
// it finds while crawling; if one disappears mid-crawl it throws ENOENT,
// which crashes the bundler (HTTP 500 during the iOS/Android bundle step).
const watchDirs = [
  path.resolve(workspaceRoot, "node_modules"),
  path.resolve(workspaceRoot, "lib"),
].filter((d) => fs.existsSync(d));

config.watchFolders = watchDirs;

// Resolve node_modules from both the package root and the monorepo root
// so pnpm-hoisted packages are found correctly.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Block any stray temp directories that may still slip through.
config.resolver.blockList = /expo-notifications_tmp_[^/]+\/.*/;

module.exports = config;
