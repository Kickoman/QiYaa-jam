import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import {
  clientMessageTypes,
  schemaBaseId,
  schemas,
  serverMessageTypes,
} from "./generated/schemas.js";
import type { ClientMessage, ServerMessage, SnapshotData } from "./generated/types.js";

export type ClientMessageType = (typeof clientMessageTypes)[number];

export type ParsedClientMessage =
  | { readonly kind: "message"; readonly message: ClientMessage }
  | { readonly kind: "malformed" }
  | { readonly kind: "unknown-type" }
  | { readonly kind: "invalid"; readonly type: ClientMessageType; readonly id: string | null };

const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: false });
for (const schema of schemas) {
  ajv.addSchema(schema);
}

function compiled(path: string): ValidateFunction {
  const validate = ajv.getSchema(schemaBaseId + path);
  if (!validate) {
    throw new Error(`protocol schema ${schemaBaseId}${path} is missing`);
  }
  return validate;
}

const clientValidators = new Map<string, ValidateFunction>(
  clientMessageTypes.map((type) => [type, compiled(`messages/${type}.schema.json`)]),
);
const anyServerMessage = compiled("server-message.schema.json");
const snapshotData = compiled("snapshot-data.schema.json");
const requestIdPattern = /^[A-Za-z0-9_-]{1,36}$/;

function isClientMessageType(type: unknown): type is ClientMessageType {
  return typeof type === "string" && clientValidators.has(type);
}

export function parseClientMessage(text: string): ParsedClientMessage {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { kind: "malformed" };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { kind: "malformed" };
  }
  const fields = data as Record<string, unknown>;
  const type = fields.type;
  if (!isClientMessageType(type)) {
    return { kind: "unknown-type" };
  }
  if (clientValidators.get(type)?.(data)) {
    return { kind: "message", message: data as ClientMessage };
  }
  const id = typeof fields.id === "string" && requestIdPattern.test(fields.id) ? fields.id : null;
  return { kind: "invalid", type, id };
}

export function isServerMessage(value: unknown): value is ServerMessage {
  return anyServerMessage(value);
}

export function isSnapshotData(value: unknown): value is SnapshotData {
  return snapshotData(value);
}

export { clientMessageTypes, serverMessageTypes };
