import type { ZodType } from "zod";

import { API_BASE_URL, API_TIMEOUT_MS } from "./config";

/** Error de la API con el código HTTP (0 si no hubo respuesta). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** 503: el backend arrancó pero aún no cargó los modelos. */
  get isWarmingUp() {
    return this.status === 503;
  }

  /** 429: se superó el límite de peticiones (60/min). */
  get isRateLimited() {
    return this.status === 429;
  }

  /** Sin respuesta: backend apagado, CORS o timeout. */
  get isNetworkError() {
    return this.status === 0;
  }
}

/** GET tipado contra el backend, con timeout y validación del esquema. */
export async function apiGet<T>(path: string, schema: ZodType<T>, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(API_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Accept: "application/json" },
      signal: combined,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    const reason = timeout.aborted ? "tiempo de espera agotado" : "no se pudo conectar";
    throw new ApiError(`Backend ${API_BASE_URL}: ${reason}`, 0);
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: unknown; error?: unknown };
      detail = String(body.detail ?? body.error ?? detail);
    } catch {
      // cuerpo no JSON: se usa statusText
    }
    throw new ApiError(detail || `HTTP ${response.status}`, response.status);
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError(`Respuesta con formato inesperado en ${path}: ${parsed.error.message}`, response.status);
  }
  return parsed.data;
}
