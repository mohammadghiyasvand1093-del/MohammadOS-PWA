import { logger } from "./logger";
import { eventPublisher } from "./eventPublisher";

export async function executeAction({
  actionName,
  source = "Unknown",
  execute,
  eventMetadata = null,
}) {
  const startedAt = performance.now();

  try {
    // ۱. عملیات اصلی (مثلاً ذخیره در دیتابیس)
    const result = await execute();

    const duration = performance.now() - startedAt;
    logger.info({
      source,
      message: `${actionName} completed in ${duration.toFixed(2)} ms`,
      context: { duration },
    });

    // ۲. انتشار رویداد در پس‌زمینه (بدون شکست عملیات اصلی)
    if (eventMetadata) {
      try {
        await eventPublisher.publish(eventMetadata);
      } catch (eventError) {
        // رویداد خطا داد، ولی داده ما در دیتابیس ذخیره شده است.
        // پس فقط لاگ می‌اندازیم و خطا را به بیرون نمی‌فرستیم.
        logger.error({
          source: "EventPublisher",
          message: `Failed to publish event for ${actionName}`,
          stack: eventError.stack,
        });
      }
    }

    return result;
  } catch (error) {
    // اینجا فقط خطاهای عملیات اصلی (execute) گرفته می‌شود
    const duration = performance.now() - startedAt;
    logger.error({
      source,
      message: `${actionName} failed after ${duration.toFixed(2)} ms`,
      stack: error.stack,
      context: { duration },
    });

    throw error; // خطا به UI می‌رود تا به کاربر نشان داده شود
  }
}