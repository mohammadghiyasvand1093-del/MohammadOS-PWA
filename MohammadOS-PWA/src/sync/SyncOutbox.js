import { db } from "../db/database";
import {
  createMutation,
  OUTBOX_OPERATIONS,
  OUTBOX_STATUSES,
} from "./SyncOutboxContract";

const DEVICE_ID_KEY = "mohammados_sync_device_id";
let memoryDeviceId = null;

export function getClientId() {
  if (typeof localStorage !== "undefined") {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
  }
  if (memoryDeviceId) return memoryDeviceId;

  const generated = `device-${typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  memoryDeviceId = generated;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(DEVICE_ID_KEY, generated);
  }
  return generated;
}

export async function enqueueMutation(mutation, table = db.syncOutbox) {
  const record = createMutation({ ...mutation, clientId: mutation.clientId || getClientId() });
  const existing = await table
    .where("[entity+entityId]")
    .equals([record.entity, record.entityId])
    .filter((item) => (
      item.status === OUTBOX_STATUSES.PENDING
      || item.status === OUTBOX_STATUSES.FAILED
    ))
    .first();

  if (existing) {
    const merged = {
      ...record,
      opId: existing.opId,
      createdAt: existing.createdAt,
      baseVersion: existing.baseVersion ?? record.baseVersion,
      attemptCount: 0,
      nextRetryAt: null,
      lastError: null,
    };
    await table.put(merged);
    return merged;
  }

  await table.add(record);
  return record;
}

export async function enqueueMutations(mutations, table = db.syncOutbox) {
  const records = [];
  for (const mutation of mutations) {
    records.push(await enqueueMutation(mutation, table));
  }
  return records;
}

export async function getPendingMutations(limit = 50, table = db.syncOutbox) {
  const now = Date.now();
  const records = await table
    .where("status")
    .anyOf([OUTBOX_STATUSES.PENDING, OUTBOX_STATUSES.FAILED])
    .toArray();

  return records
    .filter((record) => {
      if (!record.nextRetryAt) return true;
      const retryAt = new Date(record.nextRetryAt).getTime();
      return !Number.isFinite(retryAt) || retryAt <= now;
    })
    .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))
    .slice(0, Math.max(1, Number(limit) || 50));
}

export async function getMutationsForEntities(keys, table = db.syncOutbox) {
  const normalizedKeys = new Set(
    (keys || [])
      .filter((key) => key?.entity && key?.entityId)
      .map((key) => `${key.entity}\u0000${key.entityId}`)
  );
  if (normalizedKeys.size === 0) return [];

  const records = await table.toArray();
  return records.filter((record) => normalizedKeys.has(
    `${record.entity}\u0000${record.entityId}`
  ));
}

export async function getConflictMutations(table = db.syncOutbox) {
  return table.where("status").equals(OUTBOX_STATUSES.CONFLICT).toArray();
}

export async function requeueConflict(opId, baseVersion, table = db.syncOutbox) {
  const mutation = await table.get(opId);
  if (!mutation || mutation.status !== OUTBOX_STATUSES.CONFLICT) return false;
  await table.put({
    ...mutation,
    status: OUTBOX_STATUSES.PENDING,
    baseVersion: Number.isFinite(Number(baseVersion)) ? Number(baseVersion) : mutation.conflictVersion ?? null,
    nextRetryAt: null,
    lastError: null,
    conflictVersion: null,
    conflictRemote: null,
  });
  return true;
}

export async function completeMutations(opIds, table = db.syncOutbox) {
  const ids = [...new Set((opIds || []).filter(Boolean))];
  if (ids.length > 0) await table.bulkDelete(ids);
}

export async function markMutationsFailed(opIds, error, nextRetryAt, table = db.syncOutbox) {
  const ids = new Set((opIds || []).filter(Boolean));
  if (ids.size === 0) return;
  const records = await table.toArray();
  const message = String(error?.message || error || "خطای همگام‌سازی").slice(0, 240);
  await table.bulkPut(records
    .filter((record) => ids.has(record.opId))
    .map((record) => ({
      ...record,
      status: OUTBOX_STATUSES.FAILED,
      attemptCount: Number(record.attemptCount || 0) + 1,
      nextRetryAt: nextRetryAt || null,
      lastError: message,
    })));
}

export async function markMutationsConflict(conflicts, table = db.syncOutbox) {
  const byId = new Map((conflicts || []).filter((item) => item?.opId).map((item) => [item.opId, item]));
  if (byId.size === 0) return;
  const records = await table.toArray();
  await table.bulkPut(records
    .filter((record) => byId.has(record.opId))
    .map((record) => ({
      ...record,
      status: OUTBOX_STATUSES.CONFLICT,
      nextRetryAt: null,
      lastError: byId.get(record.opId)?.reason || "تعارض نسخهٔ ابری",
      conflictVersion: byId.get(record.opId)?.version ?? null,
    })));
}

export async function getOutboxSummary(table = db.syncOutbox) {
  const records = await table.toArray();
  const byStatus = records.reduce((summary, record) => {
    const status = record.status || OUTBOX_STATUSES.PENDING;
    summary[status] = (summary[status] || 0) + 1;
    return summary;
  }, {});

  return {
    count: records.length,
    pendingCount: byStatus[OUTBOX_STATUSES.PENDING] || 0,
    failedCount: byStatus[OUTBOX_STATUSES.FAILED] || 0,
    conflictCount: byStatus[OUTBOX_STATUSES.CONFLICT] || 0,
    byStatus,
  };
}

export async function clearOutbox(table = db.syncOutbox) {
  await table.clear();
}

export const SyncOutbox = {
  getClientId,
  createMutation,
  enqueueMutation,
  enqueueMutations,
  getPendingMutations,
  getMutationsForEntities,
  getConflictMutations,
  requeueConflict,
  completeMutations,
  markMutationsFailed,
  markMutationsConflict,
  getSummary: getOutboxSummary,
  clear: clearOutbox,
};

export { OUTBOX_OPERATIONS, OUTBOX_STATUSES };
