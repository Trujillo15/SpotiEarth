/**
 * Capa de sonidos naturales sintetizados con Tone.js (sin grabaciones):
 * - Agua:   ruido marrón filtrado con un vaivén lento de volumen (olas).
 * - Aire:   ruido rosa por un filtro que barre despacio (viento).
 * - Tierra: retumbo grave (ruido muy filtrado) + un tono bajo con trémolo.
 * Cada elemento tiene su propio paneo izquierda/derecha.
 */
import type { NatureLevels } from "./mapping";

type ToneModule = typeof import("tone");
type ToneNode = import("tone").ToneAudioNode;

/** Volumen máximo de cada elemento (ganancia lineal). */
const MAX = { water: 0.9, air: 0.55, land: 0.8 } as const;
/** Curva perceptual: niveles bajos se escuchan más bajos. */
const curve = (level: number, max: number) => max * Math.max(0, Math.min(1, level)) ** 1.5;

export class NatureLayer {
  private readonly water;
  private readonly air;
  private readonly land;
  private readonly sources: { start: () => unknown; dispose: () => unknown }[] = [];
  private readonly nodes: { dispose: () => unknown }[] = [];

  constructor(T: ToneModule, output: ToneNode) {
    const voice = () => {
      const level = new T.Gain(0);
      const panner = new T.Panner(0).connect(output);
      level.connect(panner);
      this.nodes.push(level, panner);
      return { level, panner };
    };

    // Agua
    this.water = voice();
    const waterNoise = new T.Noise("brown");
    const waterFilter = new T.Filter({ type: "lowpass", frequency: 700, Q: 0.5 });
    const waves = new T.Gain(0.6);
    const waveLfo = new T.LFO({ frequency: 0.13, min: 0.2, max: 1 }).connect(waves.gain);
    waterNoise.chain(waterFilter, waves, this.water.level);

    // Aire
    this.air = voice();
    const airNoise = new T.Noise("pink");
    const airFilter = new T.Filter({ type: "bandpass", frequency: 900, Q: 1.4 });
    const gustLfo = new T.LFO({ frequency: 0.07, min: 350, max: 1900 }).connect(airFilter.frequency);
    airNoise.chain(airFilter, this.air.level);

    // Tierra
    this.land = voice();
    const rumble = new T.Noise("brown");
    const rumbleFilter = new T.Filter({ type: "lowpass", frequency: 140, Q: 0.7 });
    const drone = new T.Oscillator({ frequency: 55, type: "sine" });
    const droneGain = new T.Gain(0.35);
    const tremolo = new T.LFO({ frequency: 0.5, min: 0.15, max: 0.45 }).connect(droneGain.gain);
    rumble.chain(rumbleFilter, this.land.level);
    drone.chain(droneGain, this.land.level);

    this.sources.push(waterNoise, waveLfo, airNoise, gustLfo, rumble, drone, tremolo);
    this.nodes.push(waterFilter, waves, airFilter, rumbleFilter, droneGain);
    for (const s of this.sources) s.start();
  }

  /** Lleva cada elemento a su nivel, con transición suave. */
  setLevels(levels: NatureLevels, time?: number, rampSeconds = 1.5) {
    this.water.level.gain.rampTo(curve(levels.water, MAX.water), rampSeconds, time);
    this.air.level.gain.rampTo(curve(levels.air, MAX.air), rampSeconds, time);
    this.land.level.gain.rampTo(curve(levels.land, MAX.land), rampSeconds, time);
    this.land.panner.pan.rampTo(levels.landPan * 0.85, rampSeconds, time);
    this.air.panner.pan.rampTo(levels.airPan * 0.85, rampSeconds, time);
  }

  /** Paneo del agua (normalmente centrado; en modo Explorar sigue la sonda). */
  setWaterPan(pan: number, rampSeconds = 0.1) {
    this.water.panner.pan.rampTo(pan * 0.85, rampSeconds);
  }

  dispose() {
    for (const s of this.sources) s.dispose();
    for (const n of this.nodes) n.dispose();
  }
}
