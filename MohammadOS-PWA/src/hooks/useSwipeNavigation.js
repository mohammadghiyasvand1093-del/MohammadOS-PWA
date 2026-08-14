import { useEffect } from "react";
import { navItems } from "../constants/navigation";

export function useSwipeNavigation(mainRef, location, navigate) {
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let isSwipable = true;

    const handleTouchStart = (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;

      const target = e.target;
      const parentCheck = target.closest(
        'input, textarea, select, button, [role="dialog"], [contenteditable], .overflow-x-auto, .overflow-x-scroll'
      );

      isSwipable = !parentCheck;
    };

    const handleTouchEnd = (e) => {
      if (!isSwipable) return;
      if (window.innerWidth >= 768) return;

      const deltaX = e.changedTouches[0].screenX - touchStartX;
      const deltaY = e.changedTouches[0].screenY - touchStartY;

      // ✅ بچ ۷۹: اصلاح حساسیت کشیدن انگشت
      if (Math.abs(deltaX) < 80) return; // فاصله کشیده شدن باید بیشتر باشد
      if (Math.abs(deltaY) > Math.abs(deltaX) * 0.5) return; // اگر حرکت مورب بود، لغو شود

      const currentIndex = navItems.findIndex(
        (item) => item.path === location.pathname
      );
      if (currentIndex === -1) return;

      if (deltaX < 0 && currentIndex < navItems.length - 1) {
        navigate(navItems[currentIndex + 1].path);
      } else if (deltaX > 0 && currentIndex > 0) {
        navigate(navItems[currentIndex - 1].path);
      }
    };

    main.addEventListener("touchstart", handleTouchStart, { passive: true });
    main.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      main.removeEventListener("touchstart", handleTouchStart);
      main.removeEventListener("touchend", handleTouchEnd);
    };
  }, [mainRef, location.pathname, navigate]);
}