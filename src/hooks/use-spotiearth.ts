import { useQuery } from "@tanstack/react-query";

import { ApiError, getHealth, getTimelapse } from "@/lib/api";

export const spotiEarthKeys = {
  health: ["spotiearth", "health"] as const,
  timelapse: ["spotiearth", "timelapse"] as const,
};

/**
 * Reintenta solo cuando tiene sentido:
 * - 503: el backend aún está cargando TensorFlow (tarda hasta ~2 min).
 * - sin conexión: el contenedor puede estar arrancando.
 * No reintenta 429 (límite de peticiones) ni errores de formato.
 */
function shouldRetry(failureCount: number, error: unknown) {
  if (error instanceof ApiError) {
    if (error.isWarmingUp) return failureCount < 12;
    if (error.isNetworkError) return failureCount < 3;
    return false;
  }
  return failureCount < 2;
}

const retryDelay = (attempt: number) => Math.min(2_000 * 2 ** attempt, 10_000);

/** Estado del backend; se vuelve a comprobar cada 30 s. */
export function useBackendHealth() {
  return useQuery({
    queryKey: spotiEarthKeys.health,
    queryFn: ({ signal }) => getHealth(signal),
    refetchInterval: 30_000,
    retry: false,
  });
}

/**
 * Vectores latentes del timelapse. El cálculo es costoso en el backend,
 * así que el resultado se guarda y no se vuelve a pedir automáticamente.
 */
export function useTimelapse() {
  return useQuery({
    queryKey: spotiEarthKeys.timelapse,
    queryFn: ({ signal }) => getTimelapse(signal),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: shouldRetry,
    retryDelay,
  });
}
