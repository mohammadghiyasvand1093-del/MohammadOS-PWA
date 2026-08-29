import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useEffect, lazy, Suspense, useState, useCallback, useRef, useMemo } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import SidebarWidgets from "./components/SidebarWidgets";
import { exportToJSON, isBackupStale } from "./app/exportData";
import { AggregationService } from "./service/aggregationService";

import { navItems, pagePrefetchers } from "./constants/navigation";
import { useOnboarding } from "./hooks/useOnboarding";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useSwipeNavigation } from "./hooks/useSwipeNavigation";
import { useRegisterSW } from "virtual:pwa-register/react";
import { RELEASE_INFO, RELEASE_STORAGE_KEYS } from "./constants/release";
import { useAuth } from "./auth/AuthContext";
import LoginPage from "./auth/LoginPage";

const TodayPage = lazy(() => import("./pages/TodayPage"));
const SchedulePage = lazy(() => import("./pages/SchedulePage"));
const PlannerPage = lazy(() => import("./pages/PlannerPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const AddPage = lazy(() => import("./pages/AddPage"));
const StatusPage = lazy(() => import("./pages/StatusPage"));
const RoadmapPage = lazy(() => import("./pages/RoadmapPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));

function readReleaseNotification() {
  const activeVersion = localStorage.getItem(RELEASE_STORAGE_KEYS.activeVersion);
  const pendingUpdateRaw = localStorage.getItem(RELEASE_STORAGE_KEYS.pendingUpdate);
  let pendingUpdate = null;
  if (pendingUpdateRaw) {
    try {
      pendingUpdate = JSON.parse(pendingUpdateRaw);
    } catch {
      // A malformed marker must not prevent the app from loading.
    }
  }

  const notification = activeVersion && activeVersion !== RELEASE_INFO.version
    ? {
        version: RELEASE_INFO.version,
        activatedAt: pendingUpdate?.detectedAt || new Date().toISOString(),
        summary: RELEASE_INFO.summary,
      }
    : null;

  localStorage.setItem(RELEASE_STORAGE_KEYS.activeVersion, RELEASE_INFO.version);
  localStorage.removeItem(RELEASE_STORAGE_KEYS.pendingUpdate);
  return notification;
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[300px]" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-os-border border-t-os-accent rounded-full animate-spin" aria-hidden="true" />
        <span className="text-[10px] font-mono text-os-text/40 tracking-wider uppercase">Loading Module...</span>
      </div>
    </div>
  );
}

function AccountState({ title, description, onSignOut }) {
  return (
    <main className="min-h-screen w-full flex items-center justify-center p-4 bg-os-bg text-os-text" dir="rtl">
      <section className="w-full max-w-md bg-os-card border border-os-border rounded-2xl p-6 text-center shadow-2xl">
        <div className="text-4xl mb-4" aria-hidden="true">🔒</div>
        <h1 className="text-xl font-black">{title}</h1>
        <p className="text-xs leading-6 text-os-text/60 mt-3">{description}</p>
        <button type="button" onClick={onSignOut} className="mt-6 rounded-lg border border-red-500/50 px-4 py-2 text-xs text-red-300 hover:bg-red-500/10">
          خروج
        </button>
      </section>
    </main>
  );
}

function AuthenticatedAppLayout() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [backupStale, setBackupStale] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifData, setNotifData] = useState(null);
  const [releaseNotification, setReleaseNotification] = useState(readReleaseNotification);
  
  const mainRef = useRef(null);
  const notifRef = useRef(null);

  useRegisterSW({
    immediate: true,
    onNeedReload: () => {
      localStorage.setItem(
        RELEASE_STORAGE_KEYS.pendingUpdate,
        JSON.stringify({ detectedAt: new Date().toISOString() })
      );
      window.location.reload();
    },
    onRegisterError: (error) => {
      console.warn("PWA update registration failed:", error);
    },
  });

  const { showOnboarding, onboardingStep, setOnboardingStep, handleFinishOnboarding } = useOnboarding();
  const isOnline = useOnlineStatus();

  const navigateWithTransition = useCallback((path) => {
    if (document.startViewTransition) {
      document.startViewTransition(() => navigate(path));
    } else {
      navigate(path);
    }
  }, [navigate]);

  useKeyboardShortcuts(navigateWithTransition, setCollapsed);
  useSwipeNavigation(mainRef, location, navigate);

  // ✅ Nazer 3 Fix: PWA beforeinstallprompt listener
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      window.deferredPrompt = e;
      console.log("PWA Install Prompt captured");
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    document.documentElement.lang = "fa";
    document.documentElement.dir = "rtl";
  }, []);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    if (document.startViewTransition) {
      el.focus();
      return;
    }
    el.style.opacity = 0;
    const timer = setTimeout(() => {
      el.style.opacity = 1;
      el.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  useEffect(() => {
    const check = async () => {
      try {
        const { db } = await import("./db/database.js");
        const hasData = await db.dayLogs.count() > 0;
        if (!hasData) {
          setBackupStale(false);
          return;
        }
        const lastBackup = localStorage.getItem("mohammados_last_export");
        setBackupStale(lastBackup ? isBackupStale(7) : false);
      } catch {
        setBackupStale(false);
      }
    };
    const timer = setTimeout(check, 3000);
    const interval = setInterval(check, 1000 * 60 * 60);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, []);

  useEffect(() => {
    async function fetchNotifData() {
      try {
        const stats = await AggregationService.getTodayStats();
        const lastBackupRaw = localStorage.getItem("mohammados_last_export");
        const daysSinceBackup = lastBackupRaw ? Math.floor((Date.now() - new Date(lastBackupRaw).getTime()) / (1000 * 60 * 60 * 24)) : Infinity;
        setNotifData({ streak: stats.streak ?? 0, graceUsed: stats.graceUsed ?? 0, todayRate: stats.fullDayScore ?? 0, daysSinceBackup, hasActiveTimer: Boolean(stats.timer?.isRunning) });
      } catch (err) { console.error("Notif data fetch error:", err); }
    }
    fetchNotifData();
    const interval = setInterval(fetchNotifData, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isNotifOpen && notifRef.current && !notifRef.current.contains(e.target)) setIsNotifOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isNotifOpen]);

  const handlePrefetch = useCallback((path) => {
    const prefetch = pagePrefetchers[path];
    if (prefetch) prefetch();
  }, []);

  const handleQuickBackup = useCallback(async () => {
    if (backupLoading) return;
    setBackupLoading(true);
    try {
      await exportToJSON("all");
      setBackupStale(false);
      setNotifData(prev => prev ? { ...prev, daysSinceBackup: 0 } : prev);
    } catch (err) { console.error("Quick backup failed:", err); } 
    finally { setBackupLoading(false); }
  }, [backupLoading]);

  const notifications = useMemo(() => {
    if (!notifData) return [];
    const notifs = [];
    if (releaseNotification) {
      const activatedAt = new Intl.DateTimeFormat("fa-IR", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(releaseNotification.activatedAt));
      notifs.push({
        id: `release-${releaseNotification.version}`,
        icon: "✅",
        title: `نسخه ${releaseNotification.version} به‌روزرسانی شد`,
        desc: `در ساعت ${activatedAt} فعال شد — ${releaseNotification.summary[0]}`,
        type: "success",
        action: () => setReleaseNotification(null),
        actionLabel: "متوجه شدم",
      });
    }
    if (notifData.daysSinceBackup === Infinity) notifs.push({ id: "backup_none", icon: "📦", title: "بکاپ گرفته نشده", desc: "هنوز هیچ بکاپی از داده‌ها ندارید.", type: "critical", action: handleQuickBackup, actionLabel: "بکاپ فوری" });
    else if (notifData.daysSinceBackup >= 7) notifs.push({ id: "backup_stale", icon: "⚠️", title: "بکاپ قدیمی", desc: `${notifData.daysSinceBackup} روز از آخرین بکاپ می‌گذرد.`, type: "warning", action: handleQuickBackup, actionLabel: "بکاپ فوری" });
    if (notifData.streak > 0) notifs.push({ id: "streak", icon: "🔥", title: `استریک ${notifData.streak} روزه`, desc: notifData.todayRate < 50 && !notifData.hasActiveTimer ? "امروز در خطر قطع است!" : "در حال حفظ استریک هستی.", type: notifData.todayRate < 50 && !notifData.hasActiveTimer ? "warning" : "info" });
    if (notifData.graceUsed >= 2) notifs.push({ id: "grace", icon: "❄️", title: `Grace Days: ${notifData.graceUsed}/2`, desc: "سقف ماهانه پر شده است.", type: "warning" });
    if (notifData.hasActiveTimer) notifs.push({ id: "timer", icon: "⏱️", title: "تایمر فعال است", desc: "در حال اجرای ماموریت هستی.", type: "info" });
    return notifs;
  }, [notifData, handleQuickBackup, releaseNotification]);

  const hasUnread = notifications.some(n => n.type === "critical" || n.type === "warning" || n.type === "success");

  const getPageTitle = () => {
    switch (location.pathname) {
      case "/": return "داشبورد اجرا";
      case "/week": return "کنسول مأموریت";
      case "/planner": return "برنامه‌ریز عملیاتی";
      case "/reports": return "گزارش‌ساز هوشمند";
      case "/add": return "ویرایشگر داده";
      case "/status": return "وضعیت سیستم";
      case "/roadmap": return "نقشه راه";
      case "/admin": return "پنل مدیریت";
      default: return "MohammadOS";
    }
  };

  return (
    <div className="flex h-screen w-full bg-os-bg text-os-text font-vazir rtl select-none overflow-hidden">
      {showOnboarding && (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true">
          <div className="bg-os-card border border-os-border rounded-2xl p-6 max-w-md w-full text-center shadow-2xl">
            <div className="flex justify-center gap-2 mb-6">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className={`h-2 rounded-full transition-all duration-300 ${onboardingStep === i ? 'bg-os-accent w-8' : 'bg-os-border w-2'}`}></div>
              ))}
            </div>
            {onboardingStep === 0 && (
              <div className="space-y-4 animate-fade-in">
                <div className="text-5xl mb-2">🚀</div>
                <h2 className="text-xl font-black text-os-text">به MohammadOS خوش آمدید</h2>
                <p className="text-sm text-os-text/60 leading-relaxed">سیستم‌عامل شخصی شما برای مدیریت عادت‌ها، اهداف و زمان. آماده‌ای تا زندگی‌ات را مثل یک ماموریت مدیریت کنی؟</p>
              </div>
            )}
            {onboardingStep === 1 && (
              <div className="space-y-4 text-right animate-fade-in">
                <h2 className="text-xl font-black text-os-text text-center mb-4">مفاهیم کلیدی</h2>
                <div className="flex items-start gap-3"><span className="text-2xl shrink-0">🎯</span><div><h3 className="font-bold text-os-text text-sm">Full Day</h3><p className="text-xs text-os-text/50">تکمیل ۹۰٪ عادت‌ها + انجام ماموریت‌های بحرانی</p></div></div>
                <div className="flex items-start gap-3"><span className="text-2xl shrink-0">🔥</span><div><h3 className="font-bold text-os-text text-sm">Streak</h3><p className="text-xs text-os-text/50">روزهای متوالی رسیدن به Full Day</p></div></div>
                <div className="flex items-start gap-3"><span className="text-2xl shrink-0">❄️</span><div><h3 className="font-bold text-os-text text-sm">Grace Day</h3><p className="text-xs text-os-text/50">استراحت مجاز (حداکثر ۲ روز در ماه) بدون شکستن استریک</p></div></div>
              </div>
            )}
            {onboardingStep === 2 && (
              <div className="space-y-4 text-right animate-fade-in">
                <h2 className="text-xl font-black text-os-text text-center mb-4">شروع سریع</h2>
                <ul className="space-y-3 text-sm text-os-text/70">
                  <li className="flex items-center gap-2"><span className="text-os-accent font-bold">۱.</span> به صفحه «امروز» برو.</li>
                  <li className="flex items-center gap-2"><span className="text-os-accent font-bold">۲.</span> عادت‌های روزمره را تیک بزن.</li>
                  <li className="flex items-center gap-2"><span className="text-os-accent font-bold">۳.</span> حال روز (Mood) خود را ثبت کن.</li>
                  <li className="flex items-center gap-2"><span className="text-os-accent font-bold">۴.</span> در پایان روز، گزارش را برای مشاور کپی کن.</li>
                </ul>
              </div>
            )}
            {onboardingStep === 3 && (
              <div className="space-y-4 animate-fade-in">
                <div className="text-5xl mb-2">✅</div>
                <h2 className="text-xl font-black text-os-text">آماده‌ای!</h2>
                <p className="text-sm text-os-text/60 leading-relaxed">سیستم فعال است. می‌توانی از بخش «ویرایش» عادت‌های خود را اضافه کنی.</p>
              </div>
            )}
            <div className="flex justify-between items-center mt-8">
              {onboardingStep > 0 ? <button onClick={() => setOnboardingStep(s => s - 1)} className="text-xs font-mono text-os-text/50 hover:text-os-text transition">قبلی ←</button> : <div></div>}
              {onboardingStep < 3 ? (
                <button onClick={() => setOnboardingStep(s => s + 1)} className="bg-os-accent text-os-bg px-6 py-2 rounded-lg font-mono text-sm hover:opacity-90 transition">بعدی →</button>
              ) : (
                <button onClick={handleFinishOnboarding} className="bg-emerald-500 text-white px-6 py-2 rounded-lg font-mono text-sm hover:opacity-90 transition">شروع کن 🚀</button>
              )}
            </div>
            <button onClick={handleFinishOnboarding} className="block mx-auto mt-4 text-[10px] text-os-text/30 hover:text-os-text/60 transition">رد کردن (Skip)</button>
          </div>
        </div>
      )}

      <a href="#main-content" className="sr-only focus:not-sr-only absolute top-2 left-2 z-50 bg-os-accent text-os-bg px-4 py-2 rounded shadow-lg">پرش به محتوای اصلی</a>

      <aside
        className={`hidden md:flex bg-os-card border-l border-os-border flex-col p-5 shrink-0 z-30 h-full min-h-0 overflow-y-auto transition-all duration-300 ease-out ${collapsed ? "w-16 items-center px-2" : "w-64 p-5"}`}
        aria-label="منوی اصلی کناری"
      >
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`mb-4 text-os-text/40 hover:text-os-accent transition-colors duration-200 ${collapsed ? "self-center" : "self-end"}`}
          aria-label={collapsed ? "باز کردن منو" : "جمع کردن منو"}
          aria-expanded={!collapsed}
        >
          <span className="text-lg" aria-hidden="true">{collapsed ? "→" : "←"}</span>
        </button>
        <div className={`mb-8 text-center shrink-0 transition-opacity duration-300 ${collapsed ? "opacity-0 hidden" : "opacity-100"}`}>
          <h1 className="text-xl font-black text-os-text tracking-wide">MohammadOS</h1>
          <p className="text-[9px] font-mono text-os-accent mt-1 tracking-[0.25em] uppercase">System Kernel v1.1</p>
        </div>
        <nav className={`flex flex-col gap-2 flex-1 ${collapsed ? "items-center" : ""}`} role="navigation" aria-label="ناوبری اصلی">
          {[...navItems, ...(role === "owner" ? [{ path: "/admin", label: "مدیریت", iconId: "nav-status", key: "8", ariaLabel: "پنل مدیریت حساب‌ها" }] : [])].map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              onMouseEnter={() => handlePrefetch(item.path)}
              className={({ isActive }) =>
                `flex items-center rounded-lg text-sm transition-all duration-300 border-r-2 ${
                  collapsed ? "justify-center px-2 py-3 w-10" : "justify-between px-4 py-3"
                } ${
                  isActive ? "bg-os-border/40 text-os-accent border-os-accent shadow-[0_0_20px_rgba(245,166,35,0.12)]" : "text-os-text/60 border-transparent hover:bg-os-border/20 hover:text-os-text"
                }`
              }
              title={collapsed ? item.label : undefined}
              aria-label={item.ariaLabel}
            >
              <div className={`flex items-center ${collapsed ? "gap-0" : "gap-3"}`}>
                <span className="flex items-center" aria-hidden="true"><svg className="w-5 h-5"><use href={`/icons.svg#${item.iconId}`} /></svg></span>
                <span className={`font-bold transition-all duration-300 ${collapsed ? "w-0 opacity-0 overflow-hidden" : "w-auto opacity-100"}`}>{item.label}</span>
              </div>
              <span className={`text-[9px] font-mono opacity-30 hidden lg:inline transition-opacity duration-300 ${collapsed ? "hidden" : ""}`} aria-hidden="true">Alt+{item.key}</span>
            </NavLink>
          ))}
        </nav>
        <div className={`transition-all duration-300 ${collapsed ? "opacity-0 hidden" : "opacity-100"}`}><SidebarWidgets /></div>
        <div className={`mt-4 border-t border-os-border pt-4 ${collapsed ? "flex flex-col items-center gap-2" : ""}`}>
          {!collapsed && (
            <div className="mb-2 min-w-0 text-center">
              <p className="truncate text-[10px] font-bold text-os-text/70" title={user.email}>
                {role === "owner" ? "مالک" : "مهمان"}
              </p>
              <p className="truncate text-[9px] text-os-text/40" dir="ltr" title={user.email}>
                {user.email}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => signOut()}
            className={`rounded-lg border border-red-500/40 text-red-300 transition hover:bg-red-500/10 ${collapsed ? "h-10 w-10 text-lg" : "w-full px-3 py-2 text-xs"}`}
            aria-label="خروج از حساب"
            title={collapsed ? "خروج از حساب" : undefined}
          >
            {collapsed ? "↪" : "خروج از حساب"}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 bg-os-bg/95 relative overflow-hidden">
        <header className="md:hidden flex items-center justify-between px-5 py-4 border-b border-os-border bg-os-card/50 backdrop-blur-md z-30 relative">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true"></span>
            <h2 className="text-xs font-black text-os-text">{getPageTitle()}</h2>
          </div>
          <div className="flex items-center gap-3">
            {role === "owner" && (
              <button
                type="button"
                onClick={() => navigate("/admin")}
                className="text-[10px] text-os-text/50 hover:text-os-accent"
              >
                مدیریت
              </button>
            )}
            <button
              type="button"
              onClick={() => signOut()}
              className="text-[10px] text-os-text/50 hover:text-red-300"
              title={user.email}
            >
              خروج
            </button>
            <div className="relative" ref={notifRef}>
              <button onClick={() => setIsNotifOpen(!isNotifOpen)} className="relative p-1 text-os-text/60 hover:text-os-accent transition" aria-label="مرکز نوتیفیکیشن" aria-expanded={isNotifOpen}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                {hasUnread && <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full animate-pulse" aria-hidden="true"></span>}
              </button>
              {isNotifOpen && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-os-card border border-os-border rounded-lg shadow-xl z-50 overflow-hidden animate-fade-in">
                  <div className="p-3 border-b border-os-border bg-os-bg/50"><h3 className="text-xs font-bold text-os-text">مرکز نوتیفیکیشن</h3></div>
                  <div className="divide-y divide-os-border/50 max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      // ✅ Nazer 3 Fix: Corrected typo "دارد" to "ندارد"
                      <div className="p-4 text-center text-xs text-os-text/40">هیچ نوتیفیکیشن جدیدی وجود ندارد. ✅</div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className="p-3 flex items-start gap-3 hover:bg-os-bg/30 transition">
                          <span className="text-lg shrink-0">{n.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className={`text-xs font-bold ${n.type === 'critical' ? 'text-red-400' : n.type === 'warning' ? 'text-amber-400' : n.type === 'success' ? 'text-emerald-400' : 'text-os-text'}`}>{n.title}</div>
                            <div className="text-[10px] text-os-text/50 mt-0.5">{n.desc}</div>
                            {n.action && (
                              <button onClick={() => { n.action(); setIsNotifOpen(false); }} disabled={backupLoading} className="mt-2 text-[10px] font-mono bg-os-accent/10 text-os-accent border border-os-accent/30 px-2 py-1 rounded hover:bg-os-accent/20 transition disabled:opacity-50">
                                {backupLoading ? "..." : n.actionLabel}
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <span className="text-[9px] font-mono text-os-accent bg-os-accent/10 px-2 py-0.5 rounded border border-os-accent/20">v{RELEASE_INFO.version}</span>
          </div>
        </header>

        {backupStale && (
          <div className="mx-4 mt-3 md:mx-8 md:mt-5 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 text-lg" aria-hidden="true">⚠️</span>
              <div className="flex flex-col">
                <span className="text-xs text-amber-400 font-bold">بکاپ شما قدیمی شده</span>
                <span className="text-[10px] text-os-text/50 font-mono">آخرین بکاپ: {localStorage.getItem("mohammados_last_export") ? new Date(localStorage.getItem("mohammados_last_export")).toLocaleDateString("fa-IR") : "هرگز"}</span>
              </div>
            </div>
            <button
              onClick={handleQuickBackup}
              disabled={backupLoading}
              className={`px-3 py-1.5 rounded text-[10px] font-mono font-bold border transition ${backupLoading ? "opacity-50 cursor-not-allowed border-os-border text-os-text/40" : "border-amber-500 text-amber-400 hover:bg-amber-500/20"}`}
            >
              {backupLoading ? "..." : "📦 بکاپ فوری"}
            </button>
          </div>
        )}

        {!isOnline && (
          <div className="mx-4 mt-2 md:mx-8 md:mt-3 bg-red-500/10 border border-red-500/30 rounded-lg p-2 flex items-center justify-center gap-2 shrink-0 animate-fade-in">
            <span className="text-red-400 text-sm" aria-hidden="true">📡❌</span>
            <span className="text-xs text-red-400 font-mono">اتصال اینترنت قطع است — داده‌ها به‌صورت محلی ذخیره می‌شوند</span>
          </div>
        )}

        {releaseNotification && (
          <div
            className="mx-4 mt-2 md:mx-8 md:mt-3 bg-emerald-500/10 border border-emerald-500/40 rounded-lg p-3 flex items-center justify-between gap-3 shrink-0 animate-fade-in"
            role="status"
            aria-live="polite"
          >
            <div className="min-w-0">
              <p className="text-xs text-emerald-400 font-bold">
                ✅ نسخه {releaseNotification.version} به‌روزرسانی شد
              </p>
              <p className="text-[10px] text-os-text/60 font-mono mt-1">
                در ساعت {new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(new Date(releaseNotification.activatedAt))} فعال شد — {releaseNotification.summary[0]}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReleaseNotification(null)}
              className="shrink-0 text-[10px] font-mono text-emerald-400 border border-emerald-500/40 rounded px-2 py-1 hover:bg-emerald-500/10"
            >
              فهمیدم
            </button>
          </div>
        )}

        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 transition-opacity duration-300 ease-out outline-none will-change-opacity"
        >
          <div className="max-w-3xl mx-auto">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<TodayPage />} />
                <Route path="/week" element={<SchedulePage />} />
                <Route path="/planner" element={<PlannerPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/add" element={<AddPage />} />
                <Route path="/status" element={<StatusPage />} />
                <Route path="/roadmap" element={<RoadmapPage />} />
                <Route path="/admin" element={role === "owner" ? <AdminPage /> : <Navigate to="/" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </div>
        </main>

        <nav className="md:hidden fixed bottom-4 left-4 right-4 bg-os-card/80 backdrop-blur-xl border border-os-border rounded-2xl flex justify-around items-center h-16 z-40 shadow-xl shadow-black/50" role="navigation" aria-label="ناوبری موبایل">
          <div className="flex w-full h-full px-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                aria-current={location.pathname === item.path ? "page" : undefined}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 flex-1 text-[10px] font-bold transition-all duration-200 rounded-xl my-1 relative ${
                    isActive ? "text-os-accent bg-os-border/40 shadow-[inset_0_1px_8px_rgba(245,166,35,0.05)]" : "text-os-text/50 active:scale-95"
                  }`
                }
                aria-label={item.ariaLabel}
              >
                <span className="flex items-center" aria-hidden="true"><svg className="w-5 h-5"><use href={`/icons.svg#${item.iconId}`} /></svg></span>
                <span className="font-sans text-[9px]">{item.label}</span>
                {location.pathname === item.path && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-os-accent shadow-[0_0_6px_var(--color-os-accent)]" aria-hidden="true"></span>}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

function AppLayout() {
  const { user, role, loading, profileLoading, profileError, signOut } = useAuth();

  if (loading) {
    return (
      <main className="min-h-screen w-full flex items-center justify-center bg-os-bg text-os-text" dir="rtl">
        <div className="text-sm text-os-text/60" role="status" aria-live="polite">در حال بررسی نشست حساب...</div>
      </main>
    );
  }

  if (!user) return <LoginPage />;
  if (profileLoading) {
    return (
      <main className="min-h-screen w-full flex items-center justify-center bg-os-bg text-os-text" dir="rtl">
        <div className="text-sm text-os-text/60" role="status" aria-live="polite">در حال بررسی سطح دسترسی...</div>
      </main>
    );
  }
  if (profileError || !role) {
    return (
      <AccountState
        title="حساب هنوز فعال نشده است"
        description={profileError || "برای این حساب نقش مالک یا مهمان ثبت نشده است."}
        onSignOut={signOut}
      />
    );
  }
  return <AuthenticatedAppLayout />;
}

export default function App() {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.style.colorScheme = "dark";
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
