import { useEffect, useRef } from "react";
import { navItems } from "../constants/navigation";

export function useSwipeNavigation(mainRef, location, navigate) {
  // ✅ Nazer 3 Fix: Use useRef at hook level for navigation lock
  const lastNavTime = useRef(0);
  const NAV_LOCK_MS = 300;

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let isSwipable = true;
    let currentDeltaX = 0;

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
      // ✅ Check timestamp lock
      if (Date.now() - lastNavTime.current < NAV_LOCK_MS) return;
      
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
      if (Date.now() - lastNavTime.current < NAV_LOCK_MS) return;

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
        lastNavTime.current = Date.now(); // ✅ Set lock timestamp
        navigate(navItems[currentIndex + 1].path);
      } else if (deltaX > 0 && currentIndex > 0) {
        lastNavTime.current = Date.now(); // ✅ Set lock timestamp
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