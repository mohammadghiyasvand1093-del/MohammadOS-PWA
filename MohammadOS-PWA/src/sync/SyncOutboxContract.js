export const OUTBOX_OPERATIONS = {
  UPSERT: "upsert",
  DELETE: "delete",
};

export const OUTBOX_STATUSES = {
  PENDING: "pending",
  FAILED: "failed",
};

function createId(prefix) {
  const uuid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
}

function clonePayload(payload) {
  if (payload === undefined) return null;
  if (typeof structuredClone === "function") return structuredClone(payload);
  return JSON.parse(JSON.stringify(payload));
}

export function createMutation({
  entity,
  entityId,
  operation = OUTBOX_OPERATIONS.UPSERT,
  payload = null,
  baseVersion = null,
  clientId,
  createdAt = new Date().toISOString(),
} = {}) {
  if (!entity || typeof entity !== "string") {
    throw new Error("Outbox entity is required.");
  }
  if (!entityId || typeof entityId !== "string") {
    throw new Error("Outbox entityId is required.");
  }
  if (!Object.values(OUTBOX_OPERATIONS).includes(operation)) {
    throw new Error("Outbox operation is invalid.");
  }

  return {
    opId: createId("op"),
    entity,
    entityId,
    operation,
    payload: clonePayload(payload),
    baseVersion: Number.isFinite(baseVersion) ? baseVersion : null,
    clientId: clientId || "unknown-device",
    createdAt,
    attemptCount: 0,
    nextRetryAt: null,
    status: OUTBOX_STATUSES.PENDING,
  };
}
