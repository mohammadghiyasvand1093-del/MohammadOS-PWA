// src/repositories/GateRepository.js
import { db } from "../db/database";

export const GateRepository = {
  async getAll() {
    return await db.gates.toArray();
  }
};