import { isSupabaseConfigured, supabase } from "../auth/supabaseClient";
import { db } from "../db/database";
import {
  completeMutations,
  getClientId,
  getOutboxSummary,
  getPendingMutations,
  markMutationsConflict,
  markMutationsFailed,
} from "./SyncOutbox";

const MAX_BATCH_SIZE = 50;
const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;

const ENTITY_TABLES = Object.freeze({
  habits: "habits",
  courses: "courses",
  courseSessions: "courseSessions",
  fixedEvents: "fixedEvents",
  schedules: "schedules",
  dayLogs: "dayLogs",
  gates: "gates",
  lifeWheelScores: "lifeWheelScores",
});

const ENTITY_ID_FIELDS = Object.freeze({
  habits: "id",
  courses: "id",
  courseSessions: "id",
  fixedEvents: "id",
  schedules: "id",
  dayLogs: "date",
  gates: "id",
  lifeWheelScores: "id",
});

const MAX_BASELINE_RECORDS = 10_000;
const MAX_BASELINE_BYTES = 5 * 1024 * 1024;

function getRetryDelayMs(attemptCount) {
  const exponent = Math.max(0, Math.min(Number(attemptCount) - 1, 6));
  return Math.min(MAX_RETRY_DELAY_MS, 5_000 * (2 ** exponent));
}

function getErrorText(error) {
  return String(error?.message || error || "خطای همگام‌سازی رکوردی")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function isUnavailableError(error) {
  return error?.code === "PGRST202"
    || error?.code === "42P01"
    || error?.message?.includes("apply_sync_mutations")
    || error?.message?.includes("get_sync_record_status")
    || error?.message?.includes("seed_sync_records")
    || error?.message?.includes("sync_records");
}

function isBaselineTooLargeError(error) {
  return error?.message?.includes("sync_baseline_too_large");
}

function normalizeResponse(data) {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" ? row : {};
}

function getUtf8ByteLength(value) {
  const text = JSON.stringify(value);
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text).byteLength;
  }
  return text.length;
}

function getMutationPayload(mutation) {
  return {
    opId: mutation.opId,
    entity: mutation.entity,
    entityId: mutation.entityId,
    operation: mutation.operation,
    payload: mutation.payload,
    baseVersion: mutation.baseVersion,
    createdAt: mutation.createdAt,
  };
}

async function collectLocalBaseline() {
  const tables = {};
  let recordCount = 0;

  for (const [entityName, tableName] of Object.entries(ENTITY_TABLES)) {
    const idField = ENTITY_ID_FIELDS[entityName];
    const rows = await db[tableName].toArray();
    tables[entityName] = rows.map((row) => {
      const entityId = row?.[idField];
      if (entityId === undefined || entityId === null || String(entityId).trim() === "") {
        throw new Error(`رکورد ${entityName} شناسهٔ قابل همگام‌سازی ندارد.`);
      }
      recordCount += 1;
      return {
        entityId: String(entityId),
        payload: row,
      };
    });
  }

  if (recordCount > MAX_BASELINE_RECORDS) {
    throw new Error("تعداد رکوردهای این حساب از حد مجاز نسخهٔ پایه بیشتر است.");
  }

  return {
    formatVersion: 1,
    app: "MohammadOS-PWA",
    exportedAt: new Date().toISOString(),
    tables,
  };
}

async function markSeededLocalRecords(snapshot, seededAt) {
  const tables = Object.values(ENTITY_TABLES).map((tableName) => db[tableName]);
  await db.transaction("rw", tables, async () => {
    for (const [entityName, tableName] of Object.entries(ENTITY_TABLES)) {
      const entries = snapshot.tables[entityName] || [];
      for (const entry of entries) {
        const current = await db[tableName].get(entry.entityId);
        if (!current) continue;
        await db[tableName].put({
          ...current,
          syncVersion: 1,
          syncUpdatedAt: seededAt || new Date().toISOString(),
        });
      }
    }
  });
}

async function markAcceptedLocalRecords(accepted, mutationById) {
  for (const item of accepted) {
    const mutation = mutationById.get(item.opId);
    const tableName = ENTITY_TABLES[mutation?.entity];
    const version = Number(item.version);
    if (!mutation || !tableName || !Number.isFinite(version)) continue;

    if (mutation.operation === "delete") continue;

    const current = await db[tableName].get(mutation.entityId);
    if (!current) continue;
    await db[tableName].put({
      ...current,
      syncVersion: version,
      syncUpdatedAt: item.updatedAt || new Date().toISOString(),
    });
  }
}

export const RecordSyncService = {
  getEntityTables() {
    return { ...ENTITY_TABLES };
  },

  getEntityIdFields() {
    return { ...ENTITY_ID_FIELDS };
  },

  async getStatus() {
    return {
      available: Boolean(isSupabaseConfigured && supabase),
      ...(await getOutboxSummary()),
    };
  },

  async getRemoteStatus(userId) {
    if (!isSupabaseConfigured || !supabase) {
      return { status: "unavailable", reason: "supabase_not_configured" };
    }
    if (!userId) return { status: "unauthenticated" };
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return { status: "offline" };
    }

    const { data, error } = await supabase.rpc("get_sync_record_status");
    if (error) {
      if (isUnavailableError(error)) {
        return { status: "unavailable", reason: "sql_not_installed", error };
      }
      if (isBaselineTooLargeError(error)) {
        return { status: "too_large", reason: "baseline_too_large", error };
      }
      throw error;
    }
    return normalizeResponse(data);
  },

  async seedLocalBaseline(userId) {
    if (!isSupabaseConfigured || !supabase) {
      return { status: "unavailable", reason: "supabase_not_configured" };
    }
    if (!userId) return { status: "unauthenticated" };
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return { status: "offline" };
    }

    const remoteStatus = await this.getRemoteStatus(userId);
    if (
      remoteStatus.status === "unavailable"
      || remoteStatus.status === "offline"
      || remoteStatus.status === "unauthenticated"
    ) {
      return remoteStatus;
    }
    if (remoteStatus.seeded) {
      return { status: "already_seeded", remoteStatus };
    }

    const snapshot = await collectLocalBaseline();
    if (getUtf8ByteLength(snapshot) > MAX_BASELINE_BYTES) {
      throw new Error("حجم نسخهٔ پایه از ۵ مگابایت بیشتر است؛ ابتدا داده‌های غیرضروری را پاک یا جداگانه بکاپ بگیر.");
    }
    const { data, error } = await supabase.rpc("seed_sync_records", {
      snapshot_payload: snapshot,
      device_id: getClientId(),
    });
    if (error) {
      if (isUnavailableError(error)) {
        return { status: "unavailable", reason: "sql_not_installed", error };
      }
      throw error;
    }

    const result = normalizeResponse(data);
    if (result.status === "seeded") {
      await markSeededLocalRecords(snapshot, result.seededAt);
    }
    return {
      ...result,
      seeded: result.status === "seeded" || result.status === "already_seeded",
      remoteStatus: result,
    };
  },

  async pushPending(userId, { limit = MAX_BATCH_SIZE } = {}) {
    if (!isSupabaseConfigured || !supabase) {
      return { status: "unavailable", reason: "supabase_not_configured" };
    }
    if (!userId) return { status: "unauthenticated" };
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return { status: "offline" };
    }

    const mutations = await getPendingMutations(limit);
    if (mutations.length === 0) return { status: "idle", count: 0 };

    const mutationById = new Map(mutations.map((mutation) => [mutation.opId, mutation]));
    const opIds = mutations.map((mutation) => mutation.opId);

    try {
      const { data, error } = await supabase.rpc("apply_sync_mutations", {
        next_mutations: mutations.map(getMutationPayload),
        device_id: getClientId(),
      });

      if (error) {
        if (isUnavailableError(error)) {
          return { status: "unavailable", reason: "sql_not_installed", error };
        }
        const nextRetryAt = new Date(
          Date.now() + getRetryDelayMs(Math.max(...mutations.map((item) => Number(item.attemptCount || 0))) + 1)
        ).toISOString();
        await markMutationsFailed(opIds, error, nextRetryAt);
        return { status: "failed", count: mutations.length, retryAt: nextRetryAt, error };
      }

      const response = normalizeResponse(data);
      const accepted = Array.isArray(response.accepted) ? response.accepted : [];
      const conflicts = Array.isArray(response.conflicts) ? response.conflicts : [];
      const acceptedIds = accepted.map((item) => item?.opId).filter(Boolean);

      await markAcceptedLocalRecords(accepted, mutationById);
      await completeMutations(acceptedIds);
      await markMutationsConflict(conflicts);

      const handledIds = new Set([
        ...acceptedIds,
        ...conflicts.map((item) => item?.opId).filter(Boolean),
      ]);
      const unhandledIds = opIds.filter((id) => !handledIds.has(id));
      if (unhandledIds.length > 0) {
        await markMutationsFailed(
          unhandledIds,
          new Error("پاسخ همگام‌سازی ناقص بود."),
          new Date(Date.now() + 30_000).toISOString()
        );
      }

      return {
        status: conflicts.length > 0 ? "conflict" : "synced",
        accepted: accepted.length,
        conflicts: conflicts.length,
        remaining: unhandledIds.length,
      };
    } catch (error) {
      const nextRetryAt = new Date(
        Date.now() + getRetryDelayMs(Math.max(...mutations.map((item) => Number(item.attemptCount || 0))) + 1)
      ).toISOString();
      await markMutationsFailed(opIds, error, nextRetryAt);
      return {
        status: "failed",
        count: mutations.length,
        retryAt: nextRetryAt,
        error: getErrorText(error),
      };
    }
  },
};
