const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
// kiln-mobile is an npm workspace member — shared deps are hoisted to the
// workspace root's node_modules, so Metro needs to watch and resolve from
// there too, not just its own package folder.
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, "node_modules"),
  path.join(workspaceRoot, "node_modules"),
];

module.exports = config;
