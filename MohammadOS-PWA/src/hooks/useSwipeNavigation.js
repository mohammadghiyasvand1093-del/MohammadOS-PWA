import { useEffect } from "react";
import { navItems } from "../constants/navigation";

export function useSwipeNavigation(mainRef, location, navigate) {
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let isSwipable = true;
    let currentDeltaX = 0;
    let isNavigating = false; // ✅ Nazer 2 Fix: Lock for rapid swiping

    const resetTransform = () => {
      main.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      main.style.transform = '';
      main.style.opacity = '';
    };

    const clearTransformInstant = () => {
      main.style.transition = 'none';
      main.style.transform = '';
      main.style.opacity = '';
    };

    const handleTouchStart = (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
      currentDeltaX = 0;
      clearTransformInstant();
      
      const target = e.target;
      const parentCheck = target.closest(
        'input, textarea, select, button, [role="dialog"], [contenteditable], .overflow-x-auto, .overflow-x-scroll'
      );
      isSwipable = !parentCheck;
    };

    const handleTouchMove = (e) => {
      if (!isSwipable) return;
      if (window.innerWidth >= 768) return;
      if (isNavigating) return; // ✅ اگر در حال ناوبری است، حرکت را متوقف کن
      
      currentDeltaX = e.changedTouches[0].screenX - touchStartX;
      const deltaY = e.changedTouches[0].screenY - touchStartY;
      
      if (Math.abs(currentDeltaX) > Math.abs(deltaY) * 0.5 && Math.abs(currentDeltaX) > 10) {
        main.style.transition = 'none';
        main.style.transform = `translateX(${currentDeltaX * 0.4}px)`;
        main.style.opacity = 1 - Math.min(Math.abs(currentDeltaX) / 400, 0.5);
      }
    };

    const handleTouchEnd = (e) => {
      if (!isSwipable) return;
      if (window.innerWidth >= 768) return;
      if (isNavigating) return; // ✅ قفل ناوبری

      resetTransform();
      
      const deltaX = e.changedTouches[0].screenX - touchStartX;
      const deltaY = e.changedTouches[0].screenY - touchStartY;

      if (Math.abs(deltaX) < 80) return; 
      if (Math.abs(deltaY) > Math.abs(deltaX) * 0.5) return;

      const currentIndex = navItems.findIndex(
        (item) => item.path === location.pathname
      );
      if (currentIndex === -1) return;

      if (deltaX < 0 && currentIndex < navItems.length - 1) {
        isNavigating = true; // ✅ قفل فعال شود
        navigate(navItems[currentIndex + 1].path);
      } else if (deltaX > 0 && currentIndex > 0) {
        isNavigating = true; // ✅ قفل فعال شود
        navigate(navItems[currentIndex - 1].path);
      }
    };

    const handleTouchCancel = () => {
      isSwipable = false;
      clearTransformInstant();
    };

    main.addEventListener("touchstart", handleTouchStart, { passive: true });
    main.addEventListener("touchmove", handleTouchMove, { passive: true });
    main.addEventListener("touchend", handleTouchEnd, { passive: true });
    main.addEventListener("touchcancel", handleTouchCancel, { passive: true });
    
    return () => {
      clearTransformInstant();
      main.removeEventListener("touchstart", handleTouchStart);
      main.removeEventListener("touchmove", handleTouchMove);
      main.removeEventListener("touchend", handleTouchEnd);
      main.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [mainRef, location.pathname, navigate]);
}