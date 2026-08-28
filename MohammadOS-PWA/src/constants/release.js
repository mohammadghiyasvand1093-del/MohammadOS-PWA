import packageInfo from "../../package.json";

export const RELEASE_INFO = Object.freeze({
  version: packageInfo.version,
  summary: [
    "به‌روزرسانی خودکار کنترل‌شده",
    "اعلان کوتاه پس از فعال‌شدن نسخه جدید",
    "بهبود پایداری نسخه موبایل و دسکتاپ",
  ],
});

export const RELEASE_STORAGE_KEYS = Object.freeze({
  activeVersion: "mohammados_active_version",
  pendingUpdate: "mohammados_pending_update",
});
