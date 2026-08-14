import { useState, useCallback } from "react";

export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return localStorage.getItem("mohammados_onboarding_seen") !== "v1";
  });
  const [onboardingStep, setOnboardingStep] = useState(0);

  const handleFinishOnboarding = useCallback(() => {
    localStorage.setItem("mohammados_onboarding_seen", "v1");
    setShowOnboarding(false);
  }, []);

  return {
    showOnboarding,
    onboardingStep,
    setOnboardingStep,
    handleFinishOnboarding,
  };
}