import { useState, useCallback } from "react";

export function useOnboarding(userId) {
  const storageKey = userId ? `mohammados_onboarding_seen_${userId}` : "mohammados_onboarding_seen";
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return localStorage.getItem(storageKey) !== "v1";
  });
  const [onboardingStep, setOnboardingStep] = useState(0);

  const handleFinishOnboarding = useCallback(() => {
    localStorage.setItem(storageKey, "v1");
    setShowOnboarding(false);
  }, [storageKey]);

  return {
    showOnboarding,
    onboardingStep,
    setOnboardingStep,
    handleFinishOnboarding,
  };
}
