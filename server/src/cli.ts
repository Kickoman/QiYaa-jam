import { join } from "node:path";
import { addHostKey, HostKeyError, readHostKeys, revokeHostKey } from "./host-keys.js";
import { ids } from "./net/ids.js";

const USAGE = "usage: cli keys add <name> | keys list | keys revoke <name>\n";

function run(args: readonly string[], path: string): number {
  const [group, command, name] = args;
  if (group !== "keys") {
    process.stderr.write(USAGE);
    return 1;
  }
  if (command === "list" && name === undefined) {
    for (const record of readHostKeys(path)) {
      process.stdout.write(`${record.name}\t${record.createdAt}\n`);
    }
    return 0;
  }
  if (command === "add" && name !== undefined) {
    const key = ids.hostKey();
    addHostKey(path, name, key, new Date());
    process.stdout.write(`${key}\n`);
    process.stderr.write(`key ${name} added; it is shown only now\n`);
    return 0;
  }
  if (command === "revoke" && name !== undefined) {
    if (!revokeHostKey(path, name)) {
      process.stderr.write(`no key named ${name}\n`);
      return 1;
    }
    process.stderr.write(`key ${name} revoked\n`);
    return 0;
  }
  process.stderr.write(USAGE);
  return 1;
}

const path = join(process.env.DATA_DIR ?? "/data", "host-keys.json");
try {
  process.exitCode = run(process.argv.slice(2), path);
} catch (failed) {
  if (failed instanceof HostKeyError) {
    process.stderr.write(`${failed.message}\n`);
    process.exitCode = 1;
  } else {
    throw failed;
  }
}
