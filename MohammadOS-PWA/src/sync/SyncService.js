import { db } from "../db/database";
import { isSupabaseConfigured, supabase } from "../auth/supabaseClient";
import { clearOutbox, getClientId, getOutboxSummary } from "./SyncOutbox";

export const SYNCABLE_TABLES = [
  "habits",
  "courses",
  "courseSessions",
  "fixedEvents",
  "schedules",
  "dayLogs",
  "gates",
  "lifeWheelScores",
];

const SYNC_META_KEY = "cloud-snapshot";
const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function fingerprintSnapshot(snapshot) {
  const source = stableSerialize({
    formatVersion: snapshot?.formatVersion,
    tables: snapshot?.tables,
  });
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : null;
  if (subtle && typeof TextEncoder !== "undefined") {
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(source));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16)}`;
}

function getDeviceId() {
  return getClientId();
}

function assertConfigured(userId) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("اتصال Supabase برای همگام‌سازی تنظیم نشده است.");
  }
  if (!userId) throw new Error("حساب واردشده شناسایی نشد.");
}

function normalizeRpcRow(data) {
  return Array.isArray(data) ? data[0] || null : data || null;
}

function isValidSnapshot(snapshot) {
  return Boolean(
    snapshot
    && typeof snapshot === "object"
    && snapshot.formatVersion === 1
    && snapshot.tables
    && typeof snapshot.tables === "object"
    && SYNCABLE_TABLES.every((tableName) => Array.isArray(snapshot.tables[tableName]))
  );
}

async function collectSnapshot() {
  const tables = {};
  for (const tableName of SYNCABLE_TABLES) {
    tables[tableName] = await db[tableName].toArray();
  }

  return {
    formatVersion: 1,
    app: "MohammadOS-PWA",
    exportedAt: nowIso(),
    tables,
  };
}

async function getLocalMeta() {
  return (await db.syncMeta.get(SYNC_META_KEY)) || null;
}

async function saveLocalMeta(userId, cloudRow, action, localFingerprint) {
  await db.syncMeta.put({
    key: SYNC_META_KEY,
    userId,
    cloudVersion: cloudRow?.version ?? null,
    cloudUpdatedAt: cloudRow?.updated_at ?? null,
    localFingerprint: localFingerprint || null,
    lastAction: action,
    lastSyncedAt: nowIso(),
    retryCount: 0,
    nextRetryAt: null,
    lastError: null,
  });
}

function getRetryDelayMs(retryCount) {
  const exponent = Math.max(0, Math.min(Number(retryCount) - 1, 6));
  const baseDelay = Math.min(MAX_RETRY_DELAY_MS, 5_000 * (2 ** exponent));
  const jitter = Math.round(baseDelay * 0.15 * Math.random());
  return Math.min(MAX_RETRY_DELAY_MS, baseDelay + jitter);
}

function getErrorText(error) {
  return String(error?.message || error || "خطای ناشناختهٔ همگام‌سازی")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

async function clearRetryState() {
  const localMeta = await getLocalMeta();
  if (!localMeta?.retryCount && !localMeta?.nextRetryAt && !localMeta?.lastError) return;
  await db.syncMeta.put({
    ...localMeta,
    retryCount: 0,
    nextRetryAt: null,
    lastError: null,
  });
}

async function recordFailure(userId, error) {
  const localMeta = await getLocalMeta();
  if (localMeta?.userId && localMeta.userId !== userId) return null;

  const retryCount = Number(localMeta?.retryCount || 0) + 1;
  const retryAt = new Date(Date.now() + getRetryDelayMs(retryCount)).toISOString();
  await db.syncMeta.put({
    ...(localMeta || {}),
    key: SYNC_META_KEY,
    userId,
    retryCount,
    nextRetryAt: retryAt,
    lastError: getErrorText(error),
  });
  return { retryCount, retryAt, error: getErrorText(error) };
}

async function getCloudSnapshot(userId) {
  assertConfigured(userId);
  const { data, error } = await supabase
    .from("sync_snapshots")
    .select("user_id, payload, version, updated_at, updated_by_device")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function getLocalSummary() {
  const counts = {};
  for (const tableName of SYNCABLE_TABLES) {
    counts[tableName] = await db[tableName].count();
  }
  return counts;
}

function countRecords(counts) {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

async function applySnapshot(snapshot) {
  if (!isValidSnapshot(snapshot)) {
    throw new Error("نسخهٔ ابری معتبر نیست یا با این نسخهٔ برنامه سازگار نیست.");
  }

  const tables = SYNCABLE_TABLES.map((tableName) => db[tableName]);
  await db.transaction("rw", tables, async () => {
    for (const tableName of SYNCABLE_TABLES) {
      await db[tableName].clear();
      const rows = snapshot.tables[tableName];
      if (rows.length > 0) await db[tableName].bulkPut(rows);
    }
  });
}

export const SyncService = {
  getDeviceId,
  getSyncableTables: () => [...SYNCABLE_TABLES],

  async getStatus(userId) {
    assertConfigured(userId);
    const [cloud, localMeta, localSnapshot, localCounts, outbox] = await Promise.all([
      getCloudSnapshot(userId),
      getLocalMeta(),
      collectSnapshot(),
      getLocalSummary(),
      getOutboxSummary(),
    ]);
    const localFingerprint = await fingerprintSnapshot(localSnapshot);

    return {
      cloud,
      localMeta,
      localCounts,
      localFingerprint,
      deviceId: getDeviceId(),
      outbox,
      localChanged: Boolean(
        localMeta
        && localMeta.localFingerprint !== localFingerprint
      ),
      retryAt: localMeta?.nextRetryAt || null,
      hasConflict: Boolean(
        cloud
        && (!localMeta || localMeta.cloudVersion !== cloud.version)
      ),
    };
  },

  async pushLocal(userId, { force = false } = {}) {
    assertConfigured(userId);
    await clearRetryState();
    const [cloud, localMeta, snapshot] = await Promise.all([
      getCloudSnapshot(userId),
      getLocalMeta(),
      collectSnapshot(),
    ]);
    const localFingerprint = await fingerprintSnapshot(snapshot);

    const remoteChanged = Boolean(
      cloud
      && (!localMeta || localMeta.cloudVersion !== cloud.version)
    );
    if (remoteChanged && !force) {
      return { status: "conflict", cloud, localMeta };
    }

    const expectedVersion = cloud?.version ?? null;
    const { data, error } = await supabase.rpc("save_sync_snapshot", {
      next_payload: snapshot,
      expected_version: expectedVersion,
      device_id: getDeviceId(),
    });

    if (error) {
      if (error.code === "P0001" && error.message?.includes("sync_conflict")) {
        return {
          status: "conflict",
          cloud: await getCloudSnapshot(userId),
          localMeta: await getLocalMeta(),
        };
      }
      throw error;
    }

    const saved = normalizeRpcRow(data);
    if (!saved) throw new Error("پاسخ ذخیرهٔ ابری ناقص بود.");
    await saveLocalMeta(userId, saved, "push", localFingerprint);
    await clearOutbox();
    return { status: "synced", cloud: saved };
  },

  async pullCloud(userId) {
    assertConfigured(userId);
    await clearRetryState();
    const cloud = await getCloudSnapshot(userId);
    if (!cloud) return { status: "empty" };
    await applySnapshot(cloud.payload);
    await saveLocalMeta(userId, cloud, "pull", await fingerprintSnapshot(cloud.payload));
    await clearOutbox();
    return { status: "synced", cloud };
  },

  async autoSync(userId) {
    assertConfigured(userId);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return { status: "offline" };
    }

    const localMeta = await getLocalMeta();
    const retryAtMs = localMeta?.nextRetryAt
      ? new Date(localMeta.nextRetryAt).getTime()
      : 0;
    if (retryAtMs > Date.now()) {
      return {
        status: "retry_wait",
        retryAt: localMeta.nextRetryAt,
        retryCount: localMeta.retryCount || 1,
        error: localMeta.lastError || null,
      };
    }

    const [cloud, localSnapshot] = await Promise.all([
      getCloudSnapshot(userId),
      collectSnapshot(),
    ]);
    await clearRetryState();
    const localFingerprint = await fingerprintSnapshot(localSnapshot);
    const localChanged = Boolean(
      localMeta
      && localMeta.localFingerprint !== localFingerprint
    );
    const hasLocalData = countRecords(
      Object.fromEntries(SYNCABLE_TABLES.map((tableName) => [
        tableName,
        localSnapshot.tables[tableName].length,
      ]))
    ) > 0;

    // The first cloud connection stays explicit. This prevents a fresh
    // device from silently replacing an existing cloud snapshot.
    if (!cloud) return { status: hasLocalData ? "needs_setup" : "empty" };
    if (!localMeta) return { status: "needs_setup", cloud };

    const remoteChanged = localMeta.cloudVersion !== cloud.version;
    if (localChanged && remoteChanged) {
      return { status: "conflict", cloud, localMeta };
    }
    if (remoteChanged && !localChanged) {
      await applySnapshot(cloud.payload);
      await saveLocalMeta(userId, cloud, "auto-pull", await fingerprintSnapshot(cloud.payload));
      await clearOutbox();
      return { status: "pulled", cloud };
    }
    if (localChanged && !remoteChanged) {
      const { data, error } = await supabase.rpc("save_sync_snapshot", {
        next_payload: localSnapshot,
        expected_version: cloud.version,
        device_id: getDeviceId(),
      });
      if (error) {
        if (error.code === "P0001" && error.message?.includes("sync_conflict")) {
          return { status: "conflict", cloud: await getCloudSnapshot(userId), localMeta };
        }
        throw error;
      }
      const saved = normalizeRpcRow(data);
      if (!saved) throw new Error("پاسخ ذخیرهٔ ابری ناقص بود.");
      await saveLocalMeta(userId, saved, "auto-push", localFingerprint);
      await clearOutbox();
      return { status: "pushed", cloud: saved };
    }
    return { status: "idle", cloud };
  },

  async recordFailure(userId, error) {
    assertConfigured(userId);
    return recordFailure(userId, error);
  },

  async clearFailure() {
    await clearRetryState();
  },

  getRetryDelayMs,
};
