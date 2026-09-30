// Generates src/protocol/generated/ from spec/jam/protocol/schemas: TypeScript types for every
// message, the schemas themselves for Ajv, and the lists of client and server message types.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = join(here, "../../spec/jam/protocol/schemas");
const outDir = join(here, "../src/protocol/generated");
const banner =
  "// Generated from spec/jam/protocol/schemas by server/scripts/generate-protocol.mjs. Do not edit.\n";

function files(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
}

const schemas = files(schemaDir)
  .filter((path) => path.endsWith(".schema.json"))
  .map((path) => ({
    path: relative(schemaDir, path),
    schema: JSON.parse(readFileSync(path, "utf8")),
  }));
const byPath = new Map(schemas.map((entry) => [entry.path, entry.schema]));

function messageTypes(unionFile) {
  return byPath.get(unionFile).oneOf.map((ref) => byPath.get(ref.$ref).properties.type.const);
}

const root = {
  title: "AnyMessage",
  anyOf: [{ $ref: "client-message.schema.json" }, { $ref: "server-message.schema.json" }],
};
const types = await compile(root, "AnyMessage", {
  cwd: schemaDir,
  bannerComment: "",
  additionalProperties: false,
  maxItems: -1,
  format: false,
});

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "types.ts"), banner + types);
writeFileSync(
  join(outDir, "schemas.ts"),
  banner +
    `export const schemaBaseId = ${JSON.stringify(byPath.get("defs.schema.json").$id.replace(/defs\.schema\.json$/, ""))};\n` +
    `export const clientMessageTypes = ${JSON.stringify(messageTypes("client-message.schema.json"))} as const;\n` +
    `export const serverMessageTypes = ${JSON.stringify(messageTypes("server-message.schema.json"))} as const;\n` +
    `export const schemas: readonly Record<string, unknown>[] = ${JSON.stringify(schemas.map((entry) => entry.schema))};\n`,
);
console.log(`protocol: ${schemas.length} schemas → ${relative(process.cwd(), outDir)}`);
