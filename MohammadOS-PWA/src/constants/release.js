import packageInfo from "../../package.json";

export const RELEASE_INFO = Object.freeze({
  version: packageInfo.version,
  summary: [
    "ثبت دستی و یک‌بارمصرف نسخهٔ پایهٔ رکوردی برای هر حساب",
    "دریافت صفحه‌ای و ارسال دستی تغییرات رکوردی با حفاظت اولیه از تعارض",
    "صف تغییرات محلی با تلاش دوباره و تشخیص تعارض",
    "ارسال Snapshot کنترل‌شده برای جلوگیری از جایگزینی ناخواسته",
    "نمایش وضعیت آماده‌سازی رکوردی، صف و خطا در صفحهٔ همگام‌سازی",
  ],
});

export const RELEASE_STORAGE_KEYS = Object.freeze({
  activeVersion: "mohammados_active_version",
  pendingUpdate: "mohammados_pending_update",
});
