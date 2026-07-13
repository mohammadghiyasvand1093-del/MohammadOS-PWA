import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import TodayPage from "./pages/TodayPage";
import SchedulePage from "./pages/SchedulePage";
import AddPage from "./pages/AddPage";
import StatusPage from "./pages/StatusPage";
import RoadmapPage from "./pages/RoadmapPage";
import ErrorBoundary from "./components/ErrorBoundary";

// تعریف آیتم‌های منو و اطلاعات صفحات
const navItems = [
  { path: "/", label: "امروز", icon: "🎯", key: "1" },
  { path: "/week", label: "هفته", icon: "🗓️", key: "2" },
  { path: "/add", label: "ویرایش", icon: "✏️", key: "3" },
  { path: "/status", label: "وضعیت", icon: "📊", key: "4" },
  { path: "/roadmap", label: "نقشه راه", icon: "🧭", key: "5" }
];

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // میانبرهای کیبورد برای سوییچ سریع تب‌ها (Alt + 1..5)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey && ["1", "2", "3", "4", "5"].includes(e.key)) {
        e.preventDefault();
        const targetIndex = parseInt(e.key, 10) - 1;
        navigate(navItems[targetIndex].path);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  // استخراج داینامیک عنوان صفحه برای هدر موبایل
  const getPageTitle = () => {
    switch (location.pathname) {
      case "/":
        return "داشبورد اجرا";
      case "/week":
        return "کنسول مأموریت";
      case "/add":
        return "ویرایشگر داده";
      case "/status":
        return "وضعیت سیستم";
      case "/roadmap":
        return "نقشه راه";
      default:
        return "MohammadOS";
    }
  };

  return (
    <div className="flex h-screen w-full bg-os-bg text-os-text font-vazir rtl select-none overflow-hidden">
      {/* سایدبار دسکتاپ */}
      <aside className="hidden md:flex w-64 bg-os-card border-l border-os-border flex-col p-5 shrink-0 z-30">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-black text-white tracking-wide">
            MohammadOS
          </h1>
          <p className="text-[9px] font-mono text-os-accent mt-1 tracking-[0.25em] uppercase">
            System Kernel v1.1
          </p>
        </div>

        {/* منو ناوبری دسکتاپ */}
        <nav className="flex flex-col gap-2 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `flex items-center justify-between px-4 py-3 rounded-lg text-right text-sm transition-all duration-300 border-r-2 ${
                  isActive
                    ? "bg-os-border/40 text-os-accent border-os-accent shadow-[0_0_15px_rgba(245,166,35,0.08)]"
                    : "text-os-text/60 border-transparent hover:bg-os-border/20 hover:text-white"
                }`
              }
            >
              <div className="flex items-center gap-3">
                <span className="text-base">{item.icon}</span>
                <span className="font-bold">{item.label}</span>
              </div>
              <span className="text-[9px] font-mono opacity-30 hidden lg:inline">
                Alt+{item.key}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* وضعیت دیتابیس لوکال */}
        <div className="mt-auto p-3.5 bg-os-bg/60 rounded-lg text-center border border-os-border/60">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] font-mono text-emerald-400 font-bold">
              ONLINE STATUS
            </span>
          </div>
          <p className="text-[9px] font-mono text-os-text/40 tracking-wider">
            OFFLINE READY • INDEXEDDB
          </p>
        </div>
      </aside>

      {/* بخش نمایش محتوا */}
      <div className="flex-1 flex flex-col min-w-0 bg-os-bg/95 relative overflow-hidden">
        {/* هدر بالایی در موبایل */}
        <header className="md:hidden flex items-center justify-between px-5 py-4 border-b border-os-border bg-os-card/50 backdrop-blur-md z-30">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <h2 className="text-xs font-black text-white">{getPageTitle()}</h2>
          </div>
          <span className="text-[9px] font-mono text-os-accent bg-os-accent/10 px-2 py-0.5 rounded border border-os-accent/20">
            KERNEL_v1.1
          </span>
        </header>

        {/* ناحیه اسکرول محتوای صفحات */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          <div className="max-w-3xl mx-auto">
            <Routes>
              <Route path="/" element={<TodayPage />} />
              <Route path="/week" element={<SchedulePage />} />
              <Route path="/add" element={<AddPage />} />
              <Route path="/status" element={<StatusPage />} />
              <Route path="/roadmap" element={<RoadmapPage />} />
            </Routes>
          </div>
        </main>

        {/* نوار ناوبری پایینی موبایل */}
        <nav className="md:hidden fixed bottom-4 left-4 right-4 bg-os-card/80 backdrop-blur-xl border border-os-border rounded-2xl flex justify-around items-center h-16 z-40 shadow-xl shadow-black/50">
          <div className="flex w-full h-full px-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 flex-1 text-[10px] font-bold transition-all duration-200 rounded-xl my-1 relative ${
                    isActive
                      ? "text-os-accent bg-os-border/40 shadow-[inset_0_1px_8px_rgba(245,166,35,0.05)]"
                      : "text-os-text/50 active:scale-95"
                  }`
                }
              >
                <span className="text-lg">{item.icon}</span>
                <span className="font-sans text-[9px]">{item.label}</span>
                {location.pathname === item.path && (
                  <span className="absolute bottom-1 w-1 h-1 rounded-full bg-os-accent shadow-[0_0_6px_var(--color-os-accent)]"></span>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
