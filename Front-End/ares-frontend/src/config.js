export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || `http://${window.location.hostname}:8086`;

export const API_URL = `${BACKEND_URL}/api`;
