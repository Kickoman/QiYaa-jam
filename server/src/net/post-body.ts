import type { IncomingMessage, ServerResponse } from "node:http";

export type JsonBody =
  | { readonly kind: "json"; readonly value: unknown }
  | { readonly kind: "too-large" }
  | { readonly kind: "not-json" };

async function readBody(request: IncomingMessage, limitBytes: number): Promise<Buffer | null> {
  if (Number(request.headers["content-length"] ?? "0") > limitBytes) {
    return null;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limitBytes) {
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJsonBody(
  request: IncomingMessage,
  limitBytes: number,
): Promise<JsonBody> {
  const body = await readBody(request, limitBytes);
  if (body === null) {
    return { kind: "too-large" };
  }
  try {
    return { kind: "json", value: JSON.parse(body.toString("utf8")) as unknown };
  } catch {
    return { kind: "not-json" }; // the client's mistake: answered with 400, not thrown
  }
}

export function refuse(response: ServerResponse, status: 400 | 413 | 429): void {
  const headers: Record<string, string> = { connection: "close" };
  if (status === 429) {
    headers["retry-after"] = "60";
  }
  response.writeHead(status, headers).end();
}
