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
  await table.add(record);
  return record;
}

export async function enqueueMutations(mutations, table = db.syncOutbox) {
  const records = mutations.map((mutation) => createMutation({
    ...mutation,
    clientId: mutation.clientId || getClientId(),
  }));
  if (records.length > 0) await table.bulkAdd(records);
  return records;
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
  getSummary: getOutboxSummary,
  clear: clearOutbox,
};

export { OUTBOX_OPERATIONS, OUTBOX_STATUSES };
