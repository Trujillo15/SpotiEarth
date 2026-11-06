/**
 * Configuración de la conexión con el backend de SpotiEarth (FastAPI).
 *
 * Variables de entorno (ver `.env.example`):
 * - VITE_API_URL:  URL base del backend. Por defecto http://localhost:8000
 * - VITE_API_MOCK: "true" para usar datos simulados sin backend.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const API_BASE_URL = (env["VITE_API_URL"] ?? "http://localhost:8000").replace(/\/+$/, "");

export const USE_MOCK_API = env["VITE_API_MOCK"] === "true";

/** El motor ML procesa todos los frames por petición; puede tardar. */
export const API_TIMEOUT_MS = 60_000;
