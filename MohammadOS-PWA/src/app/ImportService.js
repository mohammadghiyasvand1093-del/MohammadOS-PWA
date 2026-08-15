// src/app/ImportService.js
import { db } from "../db/database";

// ✅ Nazer 2 Fix: Corrected table names to match database.js schema
const IMPORT_TABLES = [
  "dayLogs", "habits", "courses", "gates", "schedules",
  "activeTimer", "drafts", "lifeWheelScores"
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
      } catch {
        console.warn("Gzip decompression failed, falling back to plain text.");
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

// ═══════════════════════════════════════════
// Weekly Schedule Import from AI
// ═══════════════════════════════════════════
const VALID_DAYS = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"];
const VALID_TYPES = ["work", "learning", "fitness", "break", "social", "discipline"];
const VALID_DOMAINS = ["کار", "یادگیری", "تناسب‌اندام", "استراحت", "اجتماعی", "انضباط"];
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validateScheduleJson(json) {
  const errors = [];
  
  if (!Array.isArray(json)) {
    return { valid: false, errors: ["JSON باید یک آرایه باشد"] };
  }
  if (json.length === 0) {
    return { valid: false, errors: ["آرایه خالی است"] };
  }
  if (json.length > 7) {
    return { valid: false, errors: ["حداکثر ۷ روز مجاز است"] };
  }
  
  json.forEach((day, dayIdx) => {
    if (!day.dayOfWeek || !VALID_DAYS.includes(day.dayOfWeek)) {
      errors.push(`روز ${dayIdx + 1}: dayOfWeek نامعتبر (${day.dayOfWeek || "undefined"})`);
    }
    
    if (!Array.isArray(day.schedule)) {
      errors.push(`روز ${day.dayOfWeek || dayIdx + 1}: schedule باید آرایه باشد`);
      return;
    }
    
    day.schedule.forEach((block, blockIdx) => {
      const prefix = `${day.dayOfWeek || "?"} → بلوک ${blockIdx + 1}`;
      
      if (!block.title || typeof block.title !== "string" || block.title.length > 50) {
        errors.push(`${prefix}: title نامعتبر`);
      }
      
      if (!block.startTime || !TIME_REGEX.test(block.startTime)) {
        errors.push(`${prefix}: startTime نامعتبر (${block.startTime || "?"})`);
      }
      
      if (!block.endTime || !TIME_REGEX.test(block.endTime)) {
        errors.push(`${prefix}: endTime نامعتبر (${block.endTime || "?"})`);
      }
      
      if (block.startTime && block.endTime) {
        const [sh, sm] = block.startTime.split(":").map(Number);
        const [eh, em] = block.endTime.split(":").map(Number);
        if (sh * 60 + sm >= eh * 60 + em) {
          errors.push(`${prefix}: startTime باید قبل از endTime باشد`);
        }
      }
      
      if (!block.type || !VALID_TYPES.includes(block.type)) {
        errors.push(`${prefix}: type نامعتبر (${block.type || "?"}) — باید یکی از: ${VALID_TYPES.join(", ")}`);
      }
      
      if (!block.domain || !VALID_DOMAINS.includes(block.domain)) {
        errors.push(`${prefix}: domain نامعتبر (${block.domain || "?"}) — باید یکی از: ${VALID_DOMAINS.join(", ")}`);
      }
    });
  });
  
  return { valid: errors.length === 0, errors };
}

export async function importWeeklySchedule(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error("JSON نامعتبر: " + e.message, { cause: e });
  }
  
  const validation = validateScheduleJson(parsed);
  if (!validation.valid) {
    throw new Error("خطای اعتبارسنجی:\n" + validation.errors.join("\n"));
  }
  
  // Save to db.schedules
  for (const day of parsed) {
    await db.schedules.put({
      id: day.dayOfWeek, // ✅ Nazer 2 Fix: Added missing primary key 'id'
      dayOfWeek: day.dayOfWeek,
      schedule: day.schedule.map(b => ({
        title: b.title,
        startTime: b.startTime,
        endTime: b.endTime,
        type: b.type,
        domain: b.domain,
        isCritical: Boolean(b.isCritical),
        note: b.note || "",
      })),
      updatedAt: new Date().toISOString(),
    });
  }
  
  return { importedDays: parsed.length, totalBlocks: parsed.reduce((s, d) => s + d.schedule.length, 0) };
}