import { db } from "../db/database";
import { logger } from "./logger";

export const eventPublisher = {
  async publish({ type, aggregate, aggregateId = null, payload = {}, version = 1 }) {
    try {
      const event = {
        id: crypto.randomUUID(), // <--- این خط اضافه شد تا کلید اصلی تامین شود
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