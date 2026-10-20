const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const root = path.resolve(__dirname, "..");
const { version } = require("../package.json");
const banner = `/*! AdBlockee v${version}\n${fs.readFileSync(path.join(root, "LICENSE"), "utf8").trim().split(/\r?\n/).map(line => line ? ` * ${line}` : " *").join("\n")}\n */`;
const result = buildSync({
  absWorkingDir: root,
  entryPoints: [path.join(root, "src/entry.js")],
  outfile: path.join(root, "adblockee.js"),
  bundle: true,
  format: "iife",
  target: "es2021",
  legalComments: "none",
  banner: { js: banner },
  logLevel: "silent",
});
if (result.warnings.length) throw Error(JSON.stringify(result.warnings));
console.log(`Built AdBlockee ${version}`);
