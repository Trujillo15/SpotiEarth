/**
 * Dataset del EIC que procesa el motor del backend.
 *
 * Los frames se sirven desde `public/datasets/epic/` (WebP 1024 px, convertidos
 * de los PNG 2048 px que incluye el backend en `app/timelapse_epic/`). El backend
 * identifica cada frame por su nombre (`frame_id`, p. ej. "frame_000.png"),
 * y aquí se traduce a la imagen equivalente del frontend.
 */
import type { NatureSemantics, ScaleName } from "@/lib/sonification/mapping";

export interface Dataset {
  id: string;
  title: string;
  tag: string;
  track: string;
  subtitle: string;
  instrument: string;
  science: string;
  /** Gradiente de fondo (3 colores). */
  gradient: readonly [string, string, string];
  scale: ScaleName;
  rootMidi: number;
  framesPath: string;
  coverFrame: string;
  /**
   * Qué componente del motor representa cada elemento natural. Medido
   * correlacionando los vectores del backend v1 con el análisis de color de
   * los 13 frames: PC1 ↔ océano r=+0.92 (tierra −0.92), PC5 ↔ nubes r=−0.73.
   * Si el backend recalibra el PCA, hay que volver a medirlo.
   */
  semantics: NatureSemantics;
}

export const EPIC_DATASET: Dataset = {
  id: "epic",
  title: "Earth from L1",
  tag: "Full Earth disk · EIC",
  track: "The Rotating Blue Marble",
  subtitle: "NASA EPIC · 13-frame timelapse",
  instrument: "DSCOVR · EPIC (Earth Polychromatic Imaging Camera)",
  science:
    "EPIC watches the entire sunlit face of the Earth from the L1 Lagrange point, about 1.5 million km away. Across this sequence the planet rotates: continents, oceans and cloud systems drift across the disk, and every change in what the camera sees changes the music.",
  gradient: ["oklch(0.18 0.05 250)", "oklch(0.42 0.11 230)", "oklch(0.55 0.09 200)"],
  scale: "pentatonicMajor",
  rootMidi: 45,
  framesPath: "/datasets/epic",
  coverFrame: "frame_006.png",
  semantics: {
    oceanVsLand: { pc: 0, sign: 1 },
    clouds: { pc: 4, sign: -1 },
  },
};

/** "frame_000.png" → "/datasets/epic/frame_000.webp" */
export function frameImageUrl(dataset: Dataset, frameId: string): string {
  return `${dataset.framesPath}/${frameId.replace(/\.(png|jpe?g)$/i, "")}.webp`;
}
