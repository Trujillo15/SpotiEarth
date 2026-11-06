/**
 * Análisis de color de los frames EPIC (color natural), en el navegador.
 *
 * El vector del motor describe el frame completo, pero no dice DÓNDE está
 * cada cosa. Este módulo divide el disco en una cuadrícula y clasifica cada
 * celda como océano, nubes, tierra o espacio, para:
 * - el paneo izquierda/derecha de la tierra y las nubes,
 * - el modo Explorar (oír lo que hay bajo la sonda),
 * - los resúmenes de texto para lectores de pantalla.
 *
 * Es una clasificación por umbrales de color: aproximada, pero suficiente
 * para orientar. No sustituye al motor del backend.
 */

export type Surface = "space" | "ocean" | "cloud" | "land";

export interface FrameAnalysis {
  gridSize: number;
  /** cells[row][col], fila 0 = norte (arriba). */
  cells: Surface[][];
  /** Fracción de cada superficie sobre el disco (sin contar el espacio). */
  fractions: Record<Exclude<Surface, "space">, number>;
  /** Posición horizontal media de cada superficie: -1 izquierda … 1 derecha. */
  pan: Record<Exclude<Surface, "space">, number>;
}

/** Clasifica un píxel RGB (0–255) de una imagen EPIC a color natural. */
export function classifyPixel(r: number, g: number, b: number): Surface {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const value = max / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  if (value < 0.1) return "space";
  if (value > 0.55 && saturation < 0.25) return "cloud";
  if (b >= r && b >= g * 0.9) return "ocean";
  return "land";
}

/** Analiza píxeles RGBA (como ImageData). Función pura, testeable. */
export function analyzePixels(data: ArrayLike<number>, width: number, height: number, gridSize = 24): FrameAnalysis {
  const counts = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => ({ space: 0, ocean: 0, cloud: 0, land: 0 })),
  );
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const radius = Math.min(width, height) * 0.45;

  for (let y = 0; y < height; y++) {
    const row = Math.min(gridSize - 1, Math.floor((y / height) * gridSize));
    for (let x = 0; x < width; x++) {
      const col = Math.min(gridSize - 1, Math.floor((x / width) * gridSize));
      const cell = counts[row]![col]!;
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) {
        cell.space++;
        continue;
      }
      const i = (y * width + x) * 4;
      cell[classifyPixel(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0)]++;
    }
  }

  const totals = { ocean: 0, cloud: 0, land: 0 };
  const panSum = { ocean: 0, cloud: 0, land: 0 };
  const cells = counts.map((row) =>
    row.map((c, col) => {
      const x = (col + 0.5) / gridSize * 2 - 1;
      for (const k of ["ocean", "cloud", "land"] as const) {
        totals[k] += c[k];
        panSum[k] += c[k] * x;
      }
      const best = (["space", "ocean", "cloud", "land"] as const).reduce((a, k) => (c[k] > c[a] ? k : a), "space" as Surface);
      return best;
    }),
  );

  const disk = totals.ocean + totals.cloud + totals.land || 1;
  return {
    gridSize,
    cells,
    fractions: { ocean: totals.ocean / disk, cloud: totals.cloud / disk, land: totals.land / disk },
    pan: {
      ocean: totals.ocean ? panSum.ocean / totals.ocean : 0,
      cloud: totals.cloud ? panSum.cloud / totals.cloud : 0,
      land: totals.land ? panSum.land / totals.land : 0,
    },
  };
}

/** Carga una imagen y la analiza (solo en el navegador). */
export async function analyzeImageUrl(url: string, size = 192, gridSize = 24): Promise<FrameAnalysis> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D no disponible");
  ctx.drawImage(img, 0, 0, size, size);
  return analyzePixels(ctx.getImageData(0, 0, size, size).data, size, size, gridSize);
}

const SURFACE_NAMES: Record<Surface, string> = { space: "Outer space", ocean: "Ocean", cloud: "Clouds", land: "Land" };

export const surfaceName = (s: Surface) => SURFACE_NAMES[s];

/** Posición de una celda en palabras: "north-west", "center"… (vista desde L1). */
export function describePosition(row: number, col: number, gridSize: number): string {
  const third = (i: number) => (i < gridSize / 3 ? 0 : i < (gridSize * 2) / 3 ? 1 : 2);
  const ns = ["north", "", "south"][third(row)]!;
  const we = ["west", "", "east"][third(col)]!;
  return [ns, we].filter(Boolean).join("-") || "center";
}

const panWord = (p: number) => (p < -0.25 ? "left" : p > 0.25 ? "right" : "center");

/** Resumen corto para lectores de pantalla. */
export function describeFrame(a: FrameAnalysis): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return `${pct(a.fractions.ocean)} ocean, ${pct(a.fractions.land)} land (${panWord(a.pan.land)}), ${pct(a.fractions.cloud)} clouds`;
}
