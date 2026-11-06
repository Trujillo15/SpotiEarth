import { apiGet } from "./client";
import { USE_MOCK_API } from "./config";
import { delay, mockHealth, mockTimelapse } from "./mock";
import { healthSchema, timelapseSchema, type Health, type Timelapse } from "./types";

/** GET /health — comprueba si el backend está arriba. */
export async function getHealth(signal?: AbortSignal): Promise<Health> {
  if (USE_MOCK_API) return mockHealth;
  return apiGet("/health", healthSchema, signal);
}

/**
 * GET /api/v1/test-process — ejecuta el motor ML sobre el timelapse EPIC.
 * Nota: en el backend este endpoint es temporal; si cambia la ruta,
 * solo hay que actualizarla aquí.
 */
export async function getTimelapse(signal?: AbortSignal): Promise<Timelapse> {
  if (USE_MOCK_API) {
    await delay(400);
    return mockTimelapse;
  }
  return apiGet("/api/v1/test-process", timelapseSchema, signal);
}

export { ApiError } from "./client";
export { API_BASE_URL, USE_MOCK_API } from "./config";
export type { DatasetInfo, Frame, Health, Timelapse } from "./types";
