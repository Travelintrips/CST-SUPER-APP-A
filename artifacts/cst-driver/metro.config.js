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

// Exclude transient temp directories that appear and disappear during agent sessions
// and pnpm installs. FallbackWatcher (used when Watchman is unavailable) calls
// fs.watch() on every dir it finds; if one vanishes mid-crawl it throws ENOENT,
// crashing Metro. Patterns covered:
//   expo-notifications_tmp_*  — Expo notifications temp build artefacts
//   .local/**                 — agent skill temp dirs + pnpm install temp dirs
config.resolver.blockList =
  /expo-notifications_tmp_[^/]+\/.*|[/\\]\.local[/\\].*/;

module.exports = config;
