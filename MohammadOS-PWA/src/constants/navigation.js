export const navItems = [
  { path: "/", label: "امروز", iconId: "nav-today", key: "1", ariaLabel: "داشبورد امروز" },
  { path: "/week", label: "هفته", iconId: "nav-week", key: "2", ariaLabel: "کنسول هفته" },
  { path: "/planner", label: "برنامه‌ریز", iconId: "nav-planner", key: "3", ariaLabel: "برنامه‌ریز عملیاتی" },
  { path: "/add", label: "ویرایش", iconId: "nav-add", key: "4", ariaLabel: "ویرایشگر داده" },
  { path: "/status", label: "وضعیت", iconId: "nav-status", key: "5", ariaLabel: "وضعیت سیستم" },
  { path: "/roadmap", label: "نقشه راه", iconId: "nav-roadmap", key: "6", ariaLabel: "نقشه راه مسیر شغلی" },
  { path: "/reports", label: "گزارش‌ها", iconId: "nav-reports", key: "7", ariaLabel: "گزارش‌ساز هوشمند" },
];

const syncNavItem = {
  path: "/sync",
  label: "همگام‌سازی",
  iconId: "nav-status",
  ariaLabel: "صفحهٔ همگام‌سازی",
};

const adminNavItem = {
  path: "/admin",
  label: "مدیریت",
  iconId: "nav-status",
  ownerOnly: true,
  ariaLabel: "پنل مدیریت حساب‌ها",
};

export const navigationGroups = [
  {
    id: "today",
    label: "TODAY",
    labelFa: "امروز",
    items: [navItems[0]],
  },
  {
    id: "week",
    label: "WEEK",
    labelFa: "هفته",
    items: [navItems[1], navItems[2], navItems[5], navItems[3]],
  },
  {
    id: "review",
    label: "REVIEW",
    labelFa: "مرور",
    items: [navItems[6], navItems[4]],
  },
  {
    id: "system",
    label: "SYSTEM",
    labelFa: "سیستم",
    items: [syncNavItem, adminNavItem],
  },
];

export const pagePrefetchers = {
  "/": () => import("../pages/TodayPage"),
  "/week": () => import("../pages/SchedulePage"),
  "/planner": () => import("../pages/PlannerPage"),
  "/reports": () => import("../pages/ReportsPage"),
  "/add": () => import("../pages/AddPage"),
  "/status": () => import("../pages/StatusPage"),
  "/roadmap": () => import("../pages/RoadmapPage"),
  "/sync": () => import("../pages/SyncPage"),
  "/admin": () => import("../pages/AdminPage"),
};
