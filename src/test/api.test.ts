import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiGet } from "@/lib/api/client";
import { mockTimelapse } from "@/lib/api/mock";
import { timelapseSchema } from "@/lib/api/types";

afterEach(() => vi.unstubAllGlobals());

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("API SpotiEarth", () => {
  it("el mock cumple el contrato del backend", () => {
    expect(timelapseSchema.safeParse(mockTimelapse).success).toBe(true);
    expect(mockTimelapse.frames[0]?.latent_vector).toHaveLength(8);
  });

  it("devuelve los datos validados", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(mockTimelapse)));
    await expect(apiGet("/api/v1/test-process", timelapseSchema)).resolves.toEqual(mockTimelapse);
  });

  it("convierte el 503 del backend en un error de calentamiento", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "Server is not calibrated" }, 503)));
    const error = await apiGet("/api/v1/test-process", timelapseSchema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isWarmingUp).toBe(true);
    expect((error as ApiError).message).toBe("Server is not calibrated");
  });

  it("detecta respuestas con formato inesperado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ frames: "x" })));
    await expect(apiGet("/api/v1/test-process", timelapseSchema)).rejects.toThrow(/formato inesperado/);
  });

  it("marca como error de red cuando el backend no responde", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = (await apiGet("/health", timelapseSchema).catch((e: unknown) => e)) as ApiError;
    expect(error.isNetworkError).toBe(true);
  });
});
