export async function showAppNotification(title, options = {}) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return false;
  if (Notification.permission !== "granted") return false;

  try {
    if (navigator.serviceWorker) {
      const registration = await navigator.serviceWorker.ready;
      if (registration?.showNotification) {
        await registration.showNotification(title, options);
        return true;
      }
    }
  } catch {
    // Fall back to the page notification below.
  }

  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
