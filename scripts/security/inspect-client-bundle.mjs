import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const assetsDirectory = path.resolve("dist/client/assets");

if (!existsSync(assetsDirectory)) {
  console.log("No client build present. Run `npm run build` before the bundle inspection.");
  process.exit(0);
}

const assets = readdirSync(assetsDirectory);
const scripts = assets.filter((name) => name.endsWith(".js"));
const entryScripts = scripts.filter((name) => name.startsWith("index-"));
const authScripts = scripts.filter((name) => name.startsWith("AuthSurface-"));

const failures = [];

function read(name) {
  return readFileSync(path.join(assetsDirectory, name), "utf8");
}

if (entryScripts.length === 0) failures.push("No entry chunk was produced.");
if (authScripts.length === 0) {
  failures.push("The authentication surface was not emitted as a separate chunk.");
}

// FirebaseUI must stay out of the entry chunk so the authenticated workspace never loads
// credential form code.
const lazyOnlyMarkers = ["fui-", "@firebase-oss", "tanstack", "nanostores"];
for (const name of entryScripts) {
  const content = read(name);
  for (const marker of lazyOnlyMarkers) {
    if (content.includes(marker)) {
      failures.push(`Entry chunk ${name} contains lazily loaded authentication code: ${marker}`);
    }
  }
}

// No server-side credential, model key, or privileged configuration may reach the browser.
const forbiddenInAnyAsset = [
  "GEMINI_API_KEY",
  "GEMINI_API_KEY_LOCAL",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "service_account",
  "-----BEGIN",
  "secretmanager.googleapis.com",
];
const forbiddenPatterns = [
  /ya29\.[0-9A-Za-z_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{30,}/,
  /"private_key"/,
];

for (const name of assets) {
  if (!/\.(js|css|map)$/.test(name)) continue;
  const content = read(name);

  for (const marker of forbiddenInAnyAsset) {
    if (content.includes(marker)) {
      failures.push(`Asset ${name} contains a forbidden server-side marker: ${marker}`);
    }
  }
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) {
      failures.push(`Asset ${name} contains a value resembling a credential: ${String(pattern)}`);
    }
  }
}

if (assets.some((name) => name.endsWith(".map"))) {
  failures.push("Source maps were emitted into the production client build.");
}

// FirebaseUI declares its palette inside `@layer theme` and switches to dark with
// prefers-color-scheme. Cognaxis must override those variables from an unlayered rule so the
// application palette stays authoritative and FirebaseUI follows the in-app theme control.
const authStylesheets = assets.filter(
  (name) => name.startsWith("AuthSurface-") && name.endsWith(".css"),
);

if (authStylesheets.length === 0) {
  failures.push("The authentication stylesheet was not emitted with its lazy chunk.");
}

for (const name of authStylesheets) {
  const content = read(name);
  const marker = "--fui-primary:var(--sys-primary)";
  const position = content.indexOf(marker);

  if (position === -1) {
    failures.push(`Stylesheet ${name} does not map FirebaseUI colours to Cognaxis tokens.`);
    continue;
  }

  if (isInsideCascadeLayer(content, position)) {
    failures.push(
      `Stylesheet ${name} declares the Cognaxis FirebaseUI palette inside a cascade layer, ` +
        "so the FirebaseUI theme layer can override it.",
    );
  }

  if (!content.includes(".cx-auth-card")) {
    failures.push(`Stylesheet ${name} is missing the scoped Cognaxis authentication card styles.`);
  }
}

function isInsideCascadeLayer(content, position) {
  for (const match of content.slice(0, position).matchAll(/@layer\s+[\w\s,-]*\{/g)) {
    let balance = 0;
    for (let index = match.index + match[0].length - 1; index < position; index += 1) {
      if (content[index] === "{") balance += 1;
      else if (content[index] === "}") balance -= 1;
      if (balance === 0) break;
    }
    if (balance > 0) return true;
  }
  return false;
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}

console.log(
  `Client bundle inspection passed. Entry chunks: ${entryScripts.length}. ` +
    `Lazy authentication chunks: ${authScripts.length}.`,
);
