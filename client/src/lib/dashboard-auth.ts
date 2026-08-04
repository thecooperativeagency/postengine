export const ENGINE_DASHBOARD_PASSWORD_KEY = "engine-dashboard-password";
export const ENGINE_AUTH_REQUIRED_EVENT = "engine-auth-required";
export const ENGINE_DASHBOARD_HEADER = "X-Dashboard-Password";

export function getDashboardPassword() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.sessionStorage.getItem(ENGINE_DASHBOARD_PASSWORD_KEY) || "";
}

export function setDashboardPassword(password: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(ENGINE_DASHBOARD_PASSWORD_KEY, password);
}

export function clearDashboardPassword() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(ENGINE_DASHBOARD_PASSWORD_KEY);
}

export function getDashboardAuthHeaders(extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);
  const password = getDashboardPassword();

  if (password) {
    headers.set(ENGINE_DASHBOARD_HEADER, password);
  }

  return headers;
}

export function notifyDashboardAuthRequired() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(ENGINE_AUTH_REQUIRED_EVENT));
}
