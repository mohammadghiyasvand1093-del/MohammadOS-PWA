// src/app/ImportService.js
import { db } from "../db/database";
import { ScheduleRepository } from "../repositories/ScheduleRepository";

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
// Weekly Schedule Import from AI (Batch 58 & 60)
// ═══════════════════════════════════════════
const VALID_DAYS = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"];
// ✅ Batch 60 Fix: Added 'flexible' type support
const VALID_TYPES = ["course", "fixed", "habit", "break", "event", "flexible"];
const VALID_DOMAINS = ["learning", "fitness", "discipline", "work", "rest", "social"];
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function timeToMinutes(t) {
  if (!t || !TIME_REGEX.test(t)) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function validateScheduleJson(json) {
  const errors = [];
  const warnings = []; // ✅ Batch 58: Warnings instead of errors for overlap/limits
  
  if (!Array.isArray(json)) {
    return { valid: false, errors: ["JSON باید یک آرایه باشد"], warnings: [] };
  }
  if (json.length === 0) {
    return { valid: false, errors: ["آرایه خالی است"], warnings: [] };
  }
  if (json.length > 7) {
    return { valid: false, errors: ["حداکثر ۷ روز مجاز است"], warnings: [] };
  }
  
  json.forEach((day, dayIdx) => {
    if (!day.dayOfWeek || !VALID_DAYS.includes(day.dayOfWeek)) {
      errors.push(`روز ${dayIdx + 1}: dayOfWeek نامعتبر (${day.dayOfWeek || "undefined"})`);
    }
    
    if (!Array.isArray(day.schedule)) {
      errors.push(`روز ${day.dayOfWeek || dayIdx + 1}: schedule باید آرایه باشد`);
      return;
    }
    
    let totalMinutes = 0;
    const sortedBlocks = [...day.schedule].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    
    for (let i = 0; i < sortedBlocks.length; i++) {
      const block = sortedBlocks[i];
      // 🟢 Fix 4: Use block title instead of confusing sorted index
      const prefix = `${day.dayOfWeek || "?"} → بلوک "${block.title || "?"}"`;
      
      if (!block.title || typeof block.title !== "string" || block.title.length > 50) {
        errors.push(`${prefix}: title نامعتبر`);
      }
      
      if (!block.startTime || !TIME_REGEX.test(block.startTime)) {
        errors.push(`${prefix}: startTime نامعتبر (${block.startTime || "?"})`);
      }
      
      if (!block.endTime || !TIME_REGEX.test(block.endTime)) {
        errors.push(`${prefix}: endTime نامعتبر (${block.endTime || "?"})`);
      }
      
      const startMin = timeToMinutes(block.startTime);
      const endMin = timeToMinutes(block.endTime);
      
      if (startMin < endMin) {
        totalMinutes += (endMin - startMin);
      } else if (block.startTime && block.endTime) {
        errors.push(`${prefix}: startTime باید قبل از endTime باشد`);
      }
      
      // ✅ Batch 58: Check overlap with previous block
      if (i > 0) {
        const prevBlock = sortedBlocks[i - 1];
        const prevEndMin = timeToMinutes(prevBlock.endTime);
        if (startMin < prevEndMin) {
          warnings.push(`⚠️ ${day.dayOfWeek}: هم‌پوشانی زمانی بین "${block.title}" و "${prevBlock.title}"`);
        }
      }
      
      if (!block.type || !VALID_TYPES.includes(block.type)) {
        errors.push(`${prefix}: type نامعتبر (${block.type || "?"}) — باید یکی از: ${VALID_TYPES.join(", ")}`);
      }
      
      if (!block.domain || !VALID_DOMAINS.includes(block.domain)) {
        errors.push(`${prefix}: domain نامعتبر (${block.domain || "?"}) — باید یکی از: ${VALID_DOMAINS.join(", ")}`);
      }
    }
    
    // 🟢 Fix 5: Using Math.ceil instead of Math.round
    if (totalMinutes > 1140) {
      warnings.push(`⚠️ روز ${day.dayOfWeek}: مجموع زمان بلوک‌ها بیش از ۱۹ ساعت (حدود ${Math.ceil(totalMinutes / 60)} ساعت) است.`);
    }
  });
  
  return { valid: errors.length === 0, errors, warnings };
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
  
  for (const day of parsed) {
    const scheduleData = day.schedule.map(b => ({
      title: b.title,
      startTime: b.startTime,
      endTime: b.endTime,
      type: b.type,
      domain: b.domain,
      isCritical: Boolean(b.isCritical),
      note: b.note || "",
    }));
    await ScheduleRepository.saveDaySchedule(day.dayOfWeek, scheduleData);
  }
  
  // ✅ Batch 61: Log to importHistory
  await db.importHistory.add({
    id: crypto.randomUUID(),
    type: "weekly_schedule",
    importedAt: new Date().toISOString(),
    warnings: validation.warnings
  });
  
  return { 
    importedDays: parsed.length, 
    totalBlocks: parsed.reduce((s, d) => s + d.schedule.length, 0),
    warnings: validation.warnings 
  };
}

// ═══════════════════════════════════════════
// Roadmap Import from JSON (Batch 57)
// ═══════════════════════════════════════════
export async function importRoadmapFromJSON(jsonText, replaceExisting = false) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error("JSON نامعتبر: " + e.message, { cause: e });
  }

  if (!parsed || !Array.isArray(parsed.gates)) {
    throw new Error("فرمت Roadmap نامعتبر است (باید شامل آرایه gates باشد).");
  }

  const titleToIdMap = new Map();
  const importedGates = [];

  // First pass: Generate IDs for all gates to resolve dependencies
  for (const gateData of parsed.gates) {
    const newId = crypto.randomUUID();
    titleToIdMap.set(gateData.title, newId);
  }

  // Second pass: Build full gate objects
  for (const gateData of parsed.gates) {
    const dependsOnIds = (gateData.dependsOn || []).map(title => titleToIdMap.get(title)).filter(Boolean);
    
    const criteria = (gateData.criteria || []).map(c => {
      const text = typeof c === 'string' ? c : c.title;
      return {
        id: crypto.randomUUID(),
        text,
        done: false,
        assessmentResult: "pending"
      };
    });

    const gate = {
      id: titleToIdMap.get(gateData.title),
      title: gateData.title,
      description: gateData.description || "",
      constraintNote: gateData.constraintNote || "",
      deadline: gateData.deadline || null,
      deadlineNote: gateData.deadlineNote || "",
      order: Number(gateData.order) || 0,
      dependsOn: dependsOnIds,
      criteria: criteria,
      evidenceLink: gateData.evidenceLink || null,
      linkedRefIds: [],
      progress: 0
    };
    importedGates.push(gate);
  }

  await db.transaction("rw", db.gates, db.importHistory, async () => {
    if (replaceExisting) {
      await db.gates.clear();
    }
    await db.gates.bulkPut(importedGates);
    
    await db.importHistory.add({
      id: crypto.randomUUID(),
      type: "roadmap",
      importedAt: new Date().toISOString(),
      count: importedGates.length
    });
  });

  return { importedGates: importedGates.length };
}