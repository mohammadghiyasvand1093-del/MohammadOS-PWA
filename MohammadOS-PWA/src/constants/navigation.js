export const navItems = [
  { path: "/", label: "امروز", iconId: "nav-today", key: "1", ariaLabel: "داشبورد امروز" },
  { path: "/week", label: "هفته", iconId: "nav-week", key: "2", ariaLabel: "کنسول هفته" },
  { path: "/planner", label: "برنامه‌ریز", iconId: "nav-planner", key: "3", ariaLabel: "برنامه‌ریز عملیاتی" },
  { path: "/add", label: "ویرایش", iconId: "nav-add", key: "4", ariaLabel: "ویرایشگر داده" },
  { path: "/status", label: "وضعیت", iconId: "nav-status", key: "5", ariaLabel: "وضعیت سیستم" },
  { path: "/roadmap", label: "نقشه راه", iconId: "nav-roadmap", key: "6", ariaLabel: "نقشه راه مسیر شغلی" },
  { path: "/reports", label: "گزارش‌ها", iconId: "nav-reports", key: "7", ariaLabel: "گزارش‌ساز هوشمند" },
];

export const pagePrefetchers = {
  "/": () => import("../pages/TodayPage"),
  "/week": () => import("../pages/SchedulePage"),
  "/planner": () => import("../pages/PlannerPage"),
  "/reports": () => import("../pages/ReportsPage"),
  "/add": () => import("../pages/AddPage"),
  "/status": () => import("../pages/StatusPage"),
  "/roadmap": () => import("../pages/RoadmapPage"),
};