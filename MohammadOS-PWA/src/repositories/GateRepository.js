// src/repositories/GateRepository.js
import { db } from "../db/database";

export const GateRepository = {
  async getAll() {
    const data = await db.gates.toArray();
    // ✅ FIX Bug #2: Sort by deadline (ascending). Items without deadline
    // keep their manual order relative to each other and appear after
    // dated items so upcoming milestones surface first.
    return (data || []).sort((a, b) => {
      const da = a.deadline || '';
      const db_ = b.deadline || '';
      // Both have deadlines → sort chronologically
      if (da && db_) return da.localeCompare(db_);
      // Only a has deadline → a comes first
      if (da) return -1;
      // Only b has deadline → b comes first
      if (db_) return 1;
      // Neither has deadline → preserve manual order
      return (a.order || 0) - (b.order || 0);
    });
  },

  async getById(id) {
    if (!id) return null;
    return await db.gates.get(id);
  },

  async saveGate(gate) {
    if (!gate?.id) throw new Error("Gate must have an id");
    await db.gates.put(gate);
    return gate;
  },

  async bulkSave(gates) {
    if (!Array.isArray(gates)) throw new Error("gates must be an array");
    if (gates.length === 0) return 0;
    let saved = 0;
    await db.transaction("rw", db.gates, async () => {
      await db.gates.bulkPut(gates);
      saved = gates.length;
    });
    return saved;
  },

  async replaceAll(newGates) {
    if (!Array.isArray(newGates)) throw new Error("newGates must be an array");
    let saved = 0;
    await db.transaction("rw", db.gates, async () => {
      await db.gates.clear();
      if (newGates.length > 0) {
        await db.gates.bulkPut(newGates);
        saved = newGates.length;
      }
    });
    return saved;
  },

  async deleteGate(id) {
    if (!id) return;
    await db.gates.delete(id);
  },

  async clearAll() {
    await db.gates.clear();
  },

  async count() {
    return await db.gates.count();
  },
};