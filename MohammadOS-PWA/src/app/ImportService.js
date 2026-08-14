// src/app/ImportService.js
import { db } from "../db/database";

const IMPORT_TABLES = [
  "dayLogs", "habits", "courses", "gates", "schedules",
  "timers", "drafts", "lifeWheel"
];
const MAX_RECORDS_PER_TABLE = 10000;

// ═══════════════════════════════════════════
// بچ ۷۲ — Data Compression (Import)
// ═══════════════════════════════════════════
async function decompressGzip(file) {
  const stream = file.stream().pipeThrough(new DecompressionStream("gzip"));
  const response = new Response(stream);
  return await response.text();
}

function validateImportTables(tables) {
  if (!tables || typeof tables !== "object") {
    throw new Error("INVALID_IMPORT_FORMAT");
  }

  for (const tableName of IMPORT_TABLES) {
    const records = tables[tableName];
    if (records === undefined) continue;

    if (!Array.isArray(records)) {
      throw new Error(`INVALID_TABLE_FORMAT: ${tableName}`);
    }

    if (records.length > MAX_RECORDS_PER_TABLE) {
      throw new Error(
        `TABLE_TOO_LARGE: ${tableName} (${records.length} records, max ${MAX_RECORDS_PER_TABLE})`
      );
    }

    if (!db[tableName]) {
      throw new Error(`UNKNOWN_TABLE: ${tableName}`);
    }
  }
}

export const ImportService = {
  async importData(tables) {
    validateImportTables(tables);

    const tableInstances = IMPORT_TABLES
      .map((t) => db[t])
      .filter(Boolean);

    await db.transaction("rw", ...tableInstances, async () => {
      for (const tableName of IMPORT_TABLES) {
        const records = Array.isArray(tables[tableName])
          ? tables[tableName]
          : [];
        if (records.length > 0) {
          const table = db[tableName];
          if (table) {
            await table.clear();
            await table.bulkPut(records);
          }
        }
      }
    });
  },

  async parseFile(file) {
    let text;
    const isGz = file.name.toLowerCase().endsWith(".gz");

    if (isGz) {
      try {
        text = await decompressGzip(file);
      } catch (err) {
        console.warn("Gzip decompression failed, falling back to plain text:", err);
        text = await file.text();
      }
    } else {
      text = await file.text();
    }

    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error("INVALID_IMPORT_FORMAT: Not valid JSON", { cause: err });
    }
  }
};