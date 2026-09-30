export type LogFields = Readonly<Record<string, string | number | boolean | null>>;

export function log(event: string, fields: LogFields = {}): void {
  process.stdout.write(JSON.stringify({ time: new Date().toISOString(), event, ...fields }) + "\n");
}
