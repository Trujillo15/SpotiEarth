/**
 * Mapeo de vectores latentes (CNN + PCA) a eventos musicales.
 *
 * Funciones puras, sin audio: se pueden testear y no dependen de Tone.js.
 * Funciona con cualquier número de componentes (hoy el backend envía 8;
 * el plan original hablaba de 16).
 *
 * Por cada frame del timelapse:
 * - v[0] (componente principal, la de más varianza) → raíz del acorde.
 * - v[1]                                            → brillo (filtro paso bajo).
 * - v[2]                                            → densidad rítmica (notas por frame).
 * - v[3…] (resto de componentes, en ciclo)          → notas del arpegio.
 * - media del vector                                → energía (intensidad / volumen).
 * - distancia al frame anterior                     → "movimiento" (reverb y eco).
 * Todas las alturas se cuantizan a una escala para que suene musical.
 */
import type { Frame } from "@/lib/api";

export const SCALES = {
  pentatonicMajor: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
} as const;

export type ScaleName = keyof typeof SCALES;

export interface ArpNote {
  /** Segundos desde el inicio del frame. */
  offset: number;
  midi: number;
  velocity: number;
  duration: number;
}

/**
 * Qué componente del vector representa cada elemento natural.
 * `sign: 1` → valor alto = más de ese elemento; `-1` → al revés.
 * Se configura por dataset (ver lib/datasets.ts): el significado de cada PC
 * depende de la calibración del motor y puede cambiar si se recalibra.
 */
export interface NatureSemantics {
  /** Componente que separa océano (alto) de tierra (bajo). */
  oceanVsLand: { pc: number; sign: 1 | -1 };
  /** Componente que sigue la cobertura de nubes. */
  clouds: { pc: number; sign: 1 | -1 };
}

/** Datos de posición del análisis de imagen (opcional). */
export interface FrameSpatial {
  landPan: number;
  cloudPan: number;
}

export interface NatureLevels {
  /** 0–1 */
  water: number;
  land: number;
  air: number;
  /** -1 izquierda … 1 derecha */
  landPan: number;
  airPan: number;
}

export interface FrameEvent {
  frameIndex: number;
  frameId: string;
  /** Segundos desde el inicio del timelapse. */
  time: number;
  duration: number;
  /** Notas MIDI del acorde sostenido. */
  chord: number[];
  arpeggio: ArpNote[];
  /** 0–1: apertura del filtro. */
  brightness: number;
  /** 0–1: intensidad general del frame. */
  energy: number;
  /** 0–1: cuánto cambió respecto al frame anterior. */
  motion: number;
  vector: number[];
  /** Niveles de agua / tierra / aire derivados del vector del motor. */
  nature: NatureLevels;
}

export interface Score {
  events: FrameEvent[];
  duration: number;
  secondsPerFrame: number;
}

export interface ScoreOptions {
  scale?: ScaleName;
  /** Nota MIDI raíz (48 = C3). */
  rootMidi?: number;
  secondsPerFrame?: number;
  semantics?: NatureSemantics;
  /** Posición por frame_id (del análisis de imagen), para el paneo. */
  spatial?: Record<string, FrameSpatial | undefined>;
}

/** Medido sobre la calibración v1 del motor: PC1 r=+0.92 con océano, PC5 r=−0.73 con nubes. */
export const DEFAULT_SEMANTICS: NatureSemantics = {
  oceanVsLand: { pc: 0, sign: 1 },
  clouds: { pc: 4, sign: -1 },
};

const oriented = (v: number, sign: 1 | -1) => (sign === 1 ? v : 1 - v);

export function natureLevels(vector: readonly number[], semantics: NatureSemantics, spatial?: FrameSpatial): NatureLevels {
  const ocean = oriented(clamp01(vector[semantics.oceanVsLand.pc] ?? 0.5), semantics.oceanVsLand.sign);
  const air = oriented(clamp01(vector[semantics.clouds.pc] ?? 0.5), semantics.clouds.sign);
  return {
    water: ocean,
    land: 1 - ocean,
    air,
    landPan: spatial?.landPan ?? 0,
    airPan: spatial?.cloudPan ?? 0,
  };
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0.5);

/** Grado de la escala (puede pasar de una octava) → nota MIDI. */
export function degreeToMidi(scale: readonly number[], rootMidi: number, degree: number): number {
  const len = scale.length;
  const octave = Math.floor(degree / len);
  const step = ((degree % len) + len) % len;
  return rootMidi + 12 * octave + (scale[step] ?? 0);
}

export const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export function buildScore(frames: readonly Frame[], options: ScoreOptions = {}): Score {
  const {
    scale: scaleName = "pentatonicMajor",
    rootMidi = 48,
    secondsPerFrame = 4,
    semantics = DEFAULT_SEMANTICS,
    spatial = {},
  } = options;
  const scale = SCALES[scaleName];
  const span = scale.length * 2; // dos octavas de rango

  const sorted = [...frames].sort((a, b) => a.frame_index - b.frame_index);

  const events = sorted.map((frame, i): FrameEvent => {
    const v = frame.latent_vector.map(clamp01);
    const k = v.length || 1;
    const at = (j: number) => v[j] ?? 0.5;

    const energy = v.reduce((sum, x) => sum + x, 0) / k;
    const prev = sorted[i - 1]?.latent_vector.map(clamp01);
    const motion = prev
      ? Math.min(1, Math.sqrt(v.reduce((sum, x, j) => sum + (x - (prev[j] ?? x)) ** 2, 0) / k) * 2)
      : 0;

    const rootDegree = Math.round(at(0) * (span - 1));
    const chord = [0, 2, 4].map((d) => degreeToMidi(scale, rootMidi, rootDegree + d));

    const steps = 2 + Math.round(at(2) * 6); // 2–8 notas por frame
    const melodyDims = k > 3 ? v.slice(3) : v;
    const stepLength = secondsPerFrame / steps;
    const arpeggio = Array.from({ length: steps }, (_, s): ArpNote => {
      const value = melodyDims[s % melodyDims.length] ?? 0.5;
      return {
        offset: s * stepLength,
        midi: degreeToMidi(scale, rootMidi + 12, Math.round(value * span)),
        velocity: Math.min(1, 0.3 + energy * 0.5 + (s === 0 ? 0.15 : 0)),
        duration: stepLength * 0.9,
      };
    });

    return {
      frameIndex: frame.frame_index,
      frameId: frame.frame_id,
      time: i * secondsPerFrame,
      duration: secondsPerFrame,
      chord,
      arpeggio,
      brightness: at(1),
      energy,
      motion,
      vector: v,
      nature: natureLevels(v, semantics, spatial[frame.frame_id]),
    };
  });

  return { events, duration: events.length * secondsPerFrame, secondsPerFrame };
}
