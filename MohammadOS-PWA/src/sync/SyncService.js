import { db } from "../db/database";
import { isSupabaseConfigured, supabase } from "../auth/supabaseClient";

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
const DEVICE_ID_KEY = "mohammados_sync_device_id";

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
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const generated = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(DEVICE_ID_KEY, generated);
  return generated;
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
  });
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
    const [cloud, localMeta, localSnapshot, localCounts] = await Promise.all([
      getCloudSnapshot(userId),
      getLocalMeta(),
      collectSnapshot(),
      getLocalSummary(),
    ]);
    const localFingerprint = await fingerprintSnapshot(localSnapshot);

    return {
      cloud,
      localMeta,
      localCounts,
      localFingerprint,
      deviceId: getDeviceId(),
      hasConflict: Boolean(
        cloud
        && (!localMeta || localMeta.cloudVersion !== cloud.version)
      ),
    };
  },

  async pushLocal(userId, { force = false } = {}) {
    assertConfigured(userId);
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
    return { status: "synced", cloud: saved };
  },

  async pullCloud(userId) {
    assertConfigured(userId);
    const cloud = await getCloudSnapshot(userId);
    if (!cloud) return { status: "empty" };
    await applySnapshot(cloud.payload);
    await saveLocalMeta(userId, cloud, "pull", await fingerprintSnapshot(cloud.payload));
    return { status: "synced", cloud };
  },

  async autoSync(userId) {
    assertConfigured(userId);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return { status: "offline" };
    }

    const [cloud, localMeta, localSnapshot] = await Promise.all([
      getCloudSnapshot(userId),
      getLocalMeta(),
      collectSnapshot(),
    ]);
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
      return { status: "pushed", cloud: saved };
    }
    return { status: "idle", cloud };
  },
};
