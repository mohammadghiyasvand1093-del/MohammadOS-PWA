import packageInfo from "../../package.json";

export const RELEASE_INFO = Object.freeze({
  version: packageInfo.version,
  summary: [
    "پایداری بیشتر همگام‌سازی گوشی و لپ‌تاپ",
    "تلاش دوبارهٔ کنترل‌شده هنگام خطای موقت",
    "نمایش وضعیت تعارض و تغییرات در صفحهٔ همگام‌سازی",
    "ثبت امن تغییرات محلی پیش از ارسال ابری",
  ],
});

export const RELEASE_STORAGE_KEYS = Object.freeze({
  activeVersion: "mohammados_active_version",
  pendingUpdate: "mohammados_pending_update",
});
