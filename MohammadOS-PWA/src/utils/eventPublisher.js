import { db } from "../db/database";
import { logger } from "./logger";

/**
 * UUID generator with fallback for non-secure contexts (HTTP)
 * crypto.randomUUID requires HTTPS or localhost.
 */
function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export const eventPublisher = {
  async publish({ type, aggregate, aggregateId = null, payload = {}, version = 1 }) {
    try {
      const event = {
        id: generateId(),
        type,
        aggregate,
        aggregateId,
        payload: {
          version,
          data: payload,
        },
        createdAt: new Date().toISOString(),
      };

      const id = await db.events.add(event);

      logger.info({
        source: "EventPublisher",
        message: `Published event: ${type}`,
      });

      return id;
    } catch (error) {
      logger.error({
        source: "EventPublisher",
        message: "Failed to publish event",
        stack: error.stack,
      });

      throw error;
    }
  },
};