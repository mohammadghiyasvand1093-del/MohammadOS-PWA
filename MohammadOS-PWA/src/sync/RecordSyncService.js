import { isSupabaseConfigured, supabase } from "../auth/supabaseClient";
import { db } from "../db/database";
import {
  completeMutations,
  getClientId,
  getConflictMutations,
  getMutationsForEntities,
  getOutboxSummary,
  getPendingMutations,
  markMutationsConflict,
  markMutationsFailed,
  requeueConflict,
} from "./SyncOutbox";

const MAX_BATCH_SIZE = 50;
const MAX_PULL_PAGE_SIZE = 100;
const MAX_PULL_PAGES = 100;
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
    || error?.message?.includes("pull_sync_records")
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

function getEntityKey(entity, entityId) {
  return `${entity}\u0000${entityId}`;
}

function normalizePullRecord(record) {
  if (!record || typeof record !== "object") return null;
  const entity = String(record.entity || "").trim();
  const entityId = String(record.entity_id || record.entityId || "").trim();
  const version = Number(record.version);
  if (!ENTITY_TABLES[entity] || !entityId || !Number.isFinite(version) || version < 1) {
    return null;
  }

  return {
    entity,
    entityId,
    payload: record.payload,
    version,
    deletedAt: record.deleted_at || record.deletedAt || null,
    updatedAt: record.updated_at || record.updatedAt || null,
  };
}

async function fetchRemoteRecord(entity, entityId, { maxPages = MAX_PULL_PAGES } = {}) {
  if (!isSupabaseConfigured || !supabase) return null;
  const targetKey = getEntityKey(entity, entityId);
  let cursor = null;
  let pageCount = 0;
  const pageLimit = Math.max(
    1,
    Math.min(Number(maxPages) || MAX_PULL_PAGES, MAX_PULL_PAGES)
  );

  while (pageCount < pageLimit) {
    const { data, error } = await supabase.rpc("pull_sync_records", {
      after_updated_at: cursor?.updatedAt || null,
      after_entity: cursor?.entity || null,
      after_entity_id: cursor?.entityId || null,
      page_size: MAX_PULL_PAGE_SIZE,
    });
    if (error) throw error;

    const response = normalizeResponse(data);
    const page = Array.isArray(response.records) ? response.records : [];
    const match = page
      .map(normalizePullRecord)
      .find((record) => record && getEntityKey(record.entity, record.entityId) === targetKey);
    if (match) return match;

    pageCount += 1;
    const nextCursor = response.nextCursor || response.next_cursor;
    if (!response.hasMore || !nextCursor) break;
    cursor = {
      updatedAt: nextCursor.updatedAt || nextCursor.updated_at,
      entity: nextCursor.entity,
      entityId: nextCursor.entityId || nextCursor.entity_id,
    };
    if (!cursor.updatedAt || !cursor.entity || !cursor.entityId) break;
  }

  return null;
}

async function getUntrackedLocalRecords() {
  const outbox = await db.syncOutbox.toArray();
  const outboxKeys = new Set(
    outbox.map((record) => getEntityKey(record.entity, record.entityId))
  );
  const untracked = [];

  for (const [entityName, tableName] of Object.entries(ENTITY_TABLES)) {
    const idField = ENTITY_ID_FIELDS[entityName];
    const rows = await db[tableName].toArray();
    for (const row of rows) {
      const entityId = row?.[idField];
      const key = getEntityKey(entityName, String(entityId || ""));
      if (!Number.isFinite(Number(row?.syncVersion)) && !outboxKeys.has(key)) {
        untracked.push({ entity: entityName, entityId: String(entityId || "") });
      }
    }
  }

  return untracked;
}

async function applyPulledRecords(records) {
  const tables = [...new Set(Object.values(ENTITY_TABLES))]
    .map((tableName) => db[tableName]);
  const normalizedRecords = [];
  const conflicts = [];
  for (const record of records) {
    const normalized = normalizePullRecord(record);
    if (normalized) {
      normalizedRecords.push(normalized);
    } else {
      conflicts.push({ reason: "invalid_remote_record" });
    }
  }
  let applied = 0;
  let ignored = 0;

  await db.transaction("rw", [...tables, db.syncOutbox, db.syncTombstones], async () => {
    const mutations = await getMutationsForEntities(
      normalizedRecords.map((record) => ({
        entity: record.entity,
        entityId: record.entityId,
      })),
      db.syncOutbox
    );
    const mutationByKey = new Map(
      mutations.map((mutation) => [
        getEntityKey(mutation.entity, mutation.entityId),
        mutation,
      ])
    );

    for (const remote of normalizedRecords) {
      const tableName = ENTITY_TABLES[remote.entity];
      const local = await db[tableName].get(remote.entityId);
      const localVersion = Number(local?.syncVersion || 0);

      if (remote.version <= localVersion) {
        ignored += 1;
        continue;
      }

      const mutation = mutationByKey.get(getEntityKey(remote.entity, remote.entityId));
      if (mutation) {
        const conflictRemote = {
          payload: remote.payload,
          version: remote.version,
          deletedAt: remote.deletedAt,
          updatedAt: remote.updatedAt,
        };
        conflicts.push({
          opId: mutation.opId,
          entity: remote.entity,
          entityId: remote.entityId,
          reason: "local_change_pending",
          version: remote.version,
        });
        if (mutation.status !== "conflict") {
          await db.syncOutbox.put({
            ...mutation,
            status: "conflict",
            nextRetryAt: null,
            lastError: "تغییر محلی با نسخهٔ ابری هم‌زمان شده است.",
            conflictVersion: remote.version,
            conflictRemote,
          });
        }
        continue;
      }

      if (remote.deletedAt) {
        if (local) await db[tableName].delete(remote.entityId);
        await db.syncTombstones.put({
          entity: remote.entity,
          entityId: remote.entityId,
          version: remote.version,
          updatedAt: remote.updatedAt || new Date().toISOString(),
        });
        applied += 1;
        continue;
      }

      if (!remote.payload || typeof remote.payload !== "object" || Array.isArray(remote.payload)) {
        conflicts.push({
          entity: remote.entity,
          entityId: remote.entityId,
          reason: "invalid_remote_payload",
          version: remote.version,
        });
        continue;
      }

      await db[tableName].put({
        ...remote.payload,
        syncVersion: remote.version,
        syncUpdatedAt: remote.updatedAt || new Date().toISOString(),
      });
      await db.syncTombstones.delete([remote.entity, remote.entityId]);
      applied += 1;
    }
  });

  return { applied, ignored, conflicts };
}

async function applyConflictRemote(mutation) {
  const tableName = ENTITY_TABLES[mutation.entity];
  const remote = mutation.conflictRemote || await fetchRemoteRecord(
    mutation.entity,
    mutation.entityId
  );
  if (!tableName || !remote || !Number.isFinite(Number(remote.version))) {
    throw new Error("اطلاعات نسخهٔ ابری تعارض ناقص است.");
  }

  await db.transaction("rw", [db[tableName], db.syncTombstones, db.syncOutbox], async () => {
    if (remote.deletedAt) {
      await db[tableName].delete(mutation.entityId);
      await db.syncTombstones.put({
        entity: mutation.entity,
        entityId: mutation.entityId,
        version: Number(remote.version),
        updatedAt: remote.updatedAt || new Date().toISOString(),
      });
    } else if (remote.payload && typeof remote.payload === "object" && !Array.isArray(remote.payload)) {
      await db[tableName].put({
        ...remote.payload,
        syncVersion: Number(remote.version),
        syncUpdatedAt: remote.updatedAt || new Date().toISOString(),
      });
      await db.syncTombstones.delete([mutation.entity, mutation.entityId]);
    } else {
      throw new Error("نسخهٔ ابری تعارض معتبر نیست.");
    }
    await db.syncOutbox.delete(mutation.opId);
  });
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

    if (mutation.operation === "delete") {
      await db.syncTombstones.put({
        entity: mutation.entity,
        entityId: mutation.entityId,
        version,
        updatedAt: item.updatedAt || new Date().toISOString(),
      });
      continue;
    }

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

  async getConflicts() {
    return getConflictMutations();
  },

  async resolveConflict(opId, choice) {
    const mutation = await db.syncOutbox.get(opId);
    if (!mutation || mutation.status !== "conflict") {
      return { status: "not_found" };
    }
    if (choice === "cloud") {
      await applyConflictRemote(mutation);
      return { status: "resolved_cloud" };
    }
    if (choice === "local") {
      const requeued = await requeueConflict(opId, mutation.conflictVersion);
      return { status: requeued ? "requeued_local" : "not_found" };
    }
    return { status: "invalid_choice" };
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

  async pullRemote(userId, { maxPages = MAX_PULL_PAGES } = {}) {
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
    if (!remoteStatus.seeded) {
      return { status: "not_seeded", remoteStatus };
    }

    const untrackedLocalRecords = await getUntrackedLocalRecords();
    if (untrackedLocalRecords.length > 0) {
      return {
        status: "needs_setup",
        untrackedLocalCount: untrackedLocalRecords.length,
      };
    }

    const records = [];
    let cursor = null;
    let pageCount = 0;
    const pageLimit = Math.max(
      1,
      Math.min(Number(maxPages) || MAX_PULL_PAGES, MAX_PULL_PAGES)
    );

    try {
      while (pageCount < pageLimit) {
        const { data, error } = await supabase.rpc("pull_sync_records", {
          after_updated_at: cursor?.updatedAt || null,
          after_entity: cursor?.entity || null,
          after_entity_id: cursor?.entityId || null,
          page_size: MAX_PULL_PAGE_SIZE,
        });
        if (error) {
          if (isUnavailableError(error)) {
            return { status: "unavailable", reason: "sql_not_installed", error };
          }
          throw error;
        }

        const response = normalizeResponse(data);
        const page = Array.isArray(response.records) ? response.records : [];
        records.push(...page);
        pageCount += 1;

        const nextCursor = response.nextCursor || response.next_cursor;
        if (!response.hasMore || !nextCursor) break;
        cursor = {
          updatedAt: nextCursor.updatedAt || nextCursor.updated_at,
          entity: nextCursor.entity,
          entityId: nextCursor.entityId || nextCursor.entity_id,
        };
        if (!cursor.updatedAt || !cursor.entity || !cursor.entityId) break;
      }

      const result = await applyPulledRecords(records);
      return {
        status: result.conflicts.length > 0
          ? "conflict"
          : result.applied > 0
            ? "pulled"
            : "idle",
        fetched: records.length,
        pages: pageCount,
        ...result,
      };
    } catch (error) {
      return {
        status: "failed",
        error: getErrorText(error),
      };
    }
  },

  async pushPending(userId, { limit = MAX_BATCH_SIZE } = {}) {
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
    if (!remoteStatus.seeded) {
      return { status: "not_seeded", remoteStatus };
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
