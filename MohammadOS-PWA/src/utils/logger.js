import { db } from "../db/database";

const ENABLE_CONSOLE = true;

/**
 * UUID generator with fallback for non-secure contexts (HTTP)
 * crypto.randomUUID requires HTTPS or localhost.
 */
function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

async function write(level, message, stack = null, source = "Unknown", context = null) {
  const logEntry = {
    id: generateId(),
    level,
    message,
    stack,
    source,
    context,
    createdAt: new Date().toISOString(),
  };

  // ذخیره در Dexie (fire-and-forget)
  db.logs.add(logEntry).catch((err) => {
    if (ENABLE_CONSOLE) {
      console.error("Failed to write log:", err);
    }
  });

  if (!ENABLE_CONSOLE) return;

  switch (level) {
    case "INFO":
      console.info(`[${source}] ${message}`);
      break;
    case "WARN":
      console.warn(`[${source}] ${message}`);
      break;
    case "ERROR":
      console.error(`[${source}] ${message}`, stack);
      break;
    default:
      console.log(`[${source}] ${message}`);
  }
}

export const logger = {
  info({ message, source = "Unknown", context = null }) {
    return write("INFO", message, null, source, context);
  },
  warn({ message, source = "Unknown", context = null }) {
    return write("WARN", message, null, source, context);
  },
  error({ message, stack = null, source = "Unknown", context = null }) {
    return write("ERROR", message, stack, source, context);
  },
};