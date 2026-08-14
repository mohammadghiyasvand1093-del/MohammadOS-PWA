import { useEffect } from "react";
import { navItems } from "../constants/navigation";

export function useKeyboardShortcuts(navigate, setCollapsed) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey && ["1", "2", "3", "4", "5", "6", "7"].includes(e.key)) {
        e.preventDefault();
        const targetIndex = parseInt(e.key, 10) - 1;
        navigate(navItems[targetIndex].path);
      }
      if (e.altKey && e.key === "0") {
        e.preventDefault();
        setCollapsed((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, setCollapsed]);
}