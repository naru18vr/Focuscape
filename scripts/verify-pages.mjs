import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const output = path.resolve("out");
const basePath = "/Focuscape";
const html = await readFile(path.join(output, "index.html"), "utf8");
assert.ok(html.includes("25:00"), "The export must contain the timer app.");
for (const name of ["Rain", "White Noise", "Cafe", "Ocean", "Forest", "Fireplace"]) {
  assert.ok(html.includes(name), `Missing sound control: ${name}`);
}
const references = [...new Set([...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]))];
let assets = 0;
for (const reference of references) {
  if (!reference.startsWith("/")) continue;
  const url = new URL(reference, "https://naru18vr.github.io");
  assert.ok(url.pathname.startsWith(`${basePath}/`), `Unprefixed asset URL: ${reference}`);
  const relative = decodeURIComponent(url.pathname.slice(basePath.length + 1));
  const file = path.resolve(output, relative);
  assert.ok(file.startsWith(output + path.sep), `Invalid asset path: ${reference}`);
  await access(file);
  assets++;
}
assert.ok(assets > 0, "The app must reference its scripts and styles.");
await access(path.join(output, "404.html"));
await access(path.join(output, "icon.svg"));
console.log(`Pages export verified: timer, 6 sounds, ${assets} assets under ${basePath}/, icon and 404 page.`);
