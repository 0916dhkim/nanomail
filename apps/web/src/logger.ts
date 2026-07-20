/**
 * Minimal structured logger. Writes JSON lines to stdout/stderr so they're
 * picked up by `docker logs <container>`. Avoids external dependencies.
 *
 * Each log entry is a single JSON object with: ts, level, msg, and any
 * extra fields passed in. Errors are serialized with stack traces.
 */
type Level = "info" | "warn" | "error" | "debug";

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  };
  if (fields?.error instanceof Error) {
    entry.error = {
      name: fields.error.name,
      message: fields.error.message,
      stack: fields.error.stack,
    };
  }
  const line = JSON.stringify(entry);
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const log = {
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
  debug: (msg: string, fields?: Record<string, unknown>) => write("debug", msg, fields),
};
