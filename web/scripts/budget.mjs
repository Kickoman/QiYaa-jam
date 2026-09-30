// The web guest must stay under 100 KiB gzip without fonts: people open it on mobile data.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { gzipSync } from "node:zlib";

const LIMIT_BYTES = 100 * 1024;
const dist = new URL("../dist/", import.meta.url).pathname;
const counted = new Set([".html", ".js", ".css", ".svg", ".json", ".webmanifest"]);

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

let total = 0;
for (const path of files(dist)) {
  if (counted.has(extname(path))) {
    total += gzipSync(readFileSync(path), { level: 9 }).length;
  }
}
const line = `web budget: ${(total / 1024).toFixed(1)} KiB gzip of ${LIMIT_BYTES / 1024} KiB (fonts not counted)`;
if (total > LIMIT_BYTES) {
  console.error(line);
  process.exit(1);
}
console.log(line);
