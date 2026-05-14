const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

// Patch jsc-safe-url so Metro doesn't crash when the Expo web HMR client
// sends a root-path entry URL ("https://HOST/?platform=web"). In Replit's
// proxy environment the web app runs at "/" — the HMR entry URL then has
// an empty pathname which the JSC validator rejects, killing Metro. We
// remap "/" → "/index" so the check passes without breaking bundling.
try {
  const jscSafeUrl = require("jsc-safe-url");
  if (typeof jscSafeUrl.toJscSafeUrl === "function") {
    const orig = jscSafeUrl.toJscSafeUrl.bind(jscSafeUrl);
    jscSafeUrl.toJscSafeUrl = function patchedToJscSafeUrl(url) {
      try {
        return orig(url);
      } catch (e) {
        if (String(e.message).includes("empty path")) {
          try {
            const u = new URL(url);
            if (u.pathname === "/") u.pathname = "/index";
            return orig(u.toString());
          } catch {}
        }
        throw e;
      }
    };
  }
} catch {}

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
