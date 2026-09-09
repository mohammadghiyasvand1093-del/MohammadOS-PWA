const SYNC_FIELDS = new Set(["syncVersion", "syncUpdatedAt"]);

function normalizeForComparison(value) {
  if (Array.isArray(value)) return value.map(normalizeForComparison);
  if (!value || typeof value !== "object") return value;

  return Object.keys(value)
    .filter((key) => !SYNC_FIELDS.has(key))
    .sort()
    .reduce((result, key) => {
      result[key] = normalizeForComparison(value[key]);
      return result;
    }, {});
}

export function getRestorePayload(record) {
  if (!record || typeof record !== "object") return record;
  return Object.keys(record)
    .filter((key) => !SYNC_FIELDS.has(key))
    .reduce((payload, key) => {
      payload[key] = record[key];
      return payload;
    }, {});
}

export function recordsHaveMeaningfulChanges(previous, next) {
  return JSON.stringify(normalizeForComparison(previous))
    !== JSON.stringify(normalizeForComparison(next));
}

export function buildRestoreMutations({
  tableName,
  idField,
  previousRecords = [],
  importedRecords = [],
}) {
  const getId = (record) => {
    const value = record?.[idField];
    return value === undefined || value === null ? "" : String(value);
  };
  const previousById = new Map(
    previousRecords
      .map((record) => [getId(record), record])
      .filter(([id]) => id)
  );
  const importedById = new Map(
    importedRecords
      .map((record) => [getId(record), record])
      .filter(([id]) => id)
  );
  const mutations = [];

  for (const [entityId, record] of importedById) {
    const previous = previousById.get(entityId);
    if (previous && !recordsHaveMeaningfulChanges(previous, record)) continue;
    mutations.push({
      entity: tableName,
      entityId,
      payload: getRestorePayload(record),
      baseVersion: previous?.syncVersion,
    });
  }

  for (const [entityId, previous] of previousById) {
    if (importedById.has(entityId)) continue;
    mutations.push({
      entity: tableName,
      entityId,
      operation: "delete",
      payload: { [idField]: entityId },
      baseVersion: previous?.syncVersion,
    });
  }

  return mutations;
}
