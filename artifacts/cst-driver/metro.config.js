const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = path.resolve(__dirname);
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Include the monorepo root so Metro can resolve workspace packages
config.watchFolders = [workspaceRoot];

// Resolve node_modules from both the package and the monorepo root (pnpm hoisting)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Block temp/transient directories that may appear and disappear during development
// Prevents Metro ENOENT crash when watching directories that get deleted
config.resolver.blockList = [
  /expo-notifications_tmp_[^/]+\/.*/,
  /[/\\]\.local[/\\].*/,
];

module.exports = config;
