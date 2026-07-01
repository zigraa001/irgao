// Concatenate the per-feature source modules in js/app/ into a single
// js/app.bundle.js that app.html loads with one <script> tag.
//
// Why a bundle: the app's frontend is plain (no-build) vanilla JS where ~75
// top-level let/const globals (currentBooking, map, pickupCoord, …) are shared
// across every feature. Separate classic <script> tags do NOT share top-level
// lexical scope, so splitting them into individual browser scripts would break
// those globals. Concatenating into one file keeps the dev-friendly per-feature
// source split while preserving the single shared scope the code relies on.
//
// Run: `npm run build:js` (also runs automatically via `npm start`).
const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "..", "js", "app");
const OUT = path.join(__dirname, "..", "js", "app.bundle.js");

// Load modules in numeric filename order (01-…, 02-…). The order matters only
// for top-level statements that run on load; function declarations hoist.
const files = fs
  .readdirSync(SRC_DIR)
  .filter((f) => f.endsWith(".js"))
  .sort();

const parts = [
  "// ⚠️ GENERATED FILE — do not edit by hand.",
  "// Built from js/app/*.js by scripts/build-app-js.js (npm run build:js).",
  "// Edit the source modules in js/app/ and re-run the build.",
  "",
];

for (const f of files) {
  const src = fs.readFileSync(path.join(SRC_DIR, f), "utf8");
  parts.push(`\n// ===== ${f} =====\n`);
  parts.push(src);
}

const bundle = parts.join("\n");
fs.writeFileSync(OUT, bundle);

// Cache-busting: stamp a content-hash version onto the CSS + JS links in
// app.html so browsers fetch the new assets whenever they change. The hash
// covers both the JS bundle and app.css, so editing either busts the cache.
const crypto = require("crypto");
const cssPath = path.join(__dirname, "..", "css", "app.css");
const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";
const version = crypto
  .createHash("sha1")
  .update(bundle + css)
  .digest("hex")
  .slice(0, 8);

const appHtmlPath = path.join(__dirname, "..", "app.html");
let html = fs.readFileSync(appHtmlPath, "utf8");
const before = html;
// Replace any existing ?v=… (or none) on the two asset links.
html = html.replace(
  /href="\/css\/app\.css(?:\?v=[a-f0-9]+)?"/,
  `href="/css/app.css?v=${version}"`
);
html = html.replace(
  /src="\/js\/app\.bundle\.js(?:\?v=[a-f0-9]+)?"/,
  `src="/js/app.bundle.js?v=${version}"`
);
if (html !== before) fs.writeFileSync(appHtmlPath, html);

console.log(
  `[build:js] wrote js/app.bundle.js from ${files.length} module(s); asset version v=${version}`
);
