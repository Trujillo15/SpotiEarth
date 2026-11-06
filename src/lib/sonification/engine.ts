/**
 * Motor de audio con Tone.js. Reproduce un `Score` (ver mapping.ts).
 *
 * Tone.js se importa de forma dinámica: crea un AudioContext al cargarse,
 * y eso solo debe pasar en el navegador y tras un clic del usuario
 * (política de autoplay). Nunca se carga durante el SSR.
 */
import { midiToHz, type FrameEvent, type NatureLevels, type Score } from "./mapping";
import { NatureLayer } from "./nature";

type ToneModule = typeof import("tone");
type Poly = import("tone").PolySynth;

export const PRESETS = ["Ambient", "Pulsing", "Orchestral", "Granular"] as const;

/** Qué capas suenan: sonidos naturales, música, o ambas. */
export const LAYER_MODES = ["Nature + music", "Nature only", "Music only"] as const;
export type LayerMode = (typeof LAYER_MODES)[number];

export type ProbeSurface = "space" | "ocean" | "cloud" | "land";

/** Volumen de la música cuando suena junto a la naturaleza (queda de fondo). */
const MUSIC_UNDER_NATURE = 0.35;
export type Preset = (typeof PRESETS)[number];

interface PresetSpec {
  pad: (T: ToneModule) => Poly;
  lead: (T: ToneModule) => Poly;
  /** Veces que se repite el arpegio dentro de cada frame. */
  repeat: number;
  padLevel: number;
  leadLevel: number;
  reverb: number;
  /** Desafinación aleatoria por nota, en cents (textura granular). */
  jitterCents: number;
}

const PRESET_SPECS: Record<Preset, PresetSpec> = {
  Ambient: {
    pad: (T) => new T.PolySynth(T.Synth, { oscillator: { type: "sine" }, envelope: { attack: 1.5, decay: 0.5, sustain: 0.8, release: 3 } }),
    lead: (T) => new T.PolySynth(T.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.05, decay: 0.3, sustain: 0.2, release: 1.5 } }),
    repeat: 1, padLevel: -10, leadLevel: -16, reverb: 0.55, jitterCents: 0,
  },
  Pulsing: {
    pad: (T) => new T.PolySynth(T.Synth, { oscillator: { type: "sawtooth" }, envelope: { attack: 0.02, decay: 0.4, sustain: 0.3, release: 0.6 } }),
    lead: (T) => new T.PolySynth(T.Synth, { oscillator: { type: "square" }, envelope: { attack: 0.005, decay: 0.12, sustain: 0, release: 0.1 } }),
    repeat: 2, padLevel: -18, leadLevel: -18, reverb: 0.25, jitterCents: 0,
  },
  Orchestral: {
    pad: (T) => new T.PolySynth(T.FMSynth, { harmonicity: 1.5, modulationIndex: 3, envelope: { attack: 1.2, decay: 0.3, sustain: 0.9, release: 2.5 } }),
    lead: (T) => new T.PolySynth(T.AMSynth, { harmonicity: 2, envelope: { attack: 0.08, decay: 0.4, sustain: 0.4, release: 1.2 } }),
    repeat: 1, padLevel: -14, leadLevel: -14, reverb: 0.45, jitterCents: 0,
  },
  Granular: {
    pad: (T) => new T.PolySynth(T.Synth, { oscillator: { type: "sine" }, envelope: { attack: 2, decay: 1, sustain: 0.6, release: 3 } }),
    lead: (T) => new T.PolySynth(T.Synth, { oscillator: { type: "sine" }, envelope: { attack: 0.005, decay: 0.06, sustain: 0, release: 0.05 } }),
    repeat: 4, padLevel: -16, leadLevel: -12, reverb: 0.6, jitterCents: 35,
  },
};

const jitter = (hz: number, cents: number) => (cents ? hz * 2 ** (((Math.random() * 2 - 1) * cents) / 1200) : hz);

export class SonificationEngine {
  private readonly filter;
  private readonly delay;
  private readonly reverb;
  private readonly master;
  private readonly musicBus;
  private readonly natureBus;
  private readonly nature: NatureLayer;
  private readonly probeSynth;
  private pad: Poly | null = null;
  private lead: Poly | null = null;
  private part: import("tone").Part<FrameEvent> | null = null;
  private spec: PresetSpec = PRESET_SPECS.Ambient;
  private score: Score | null = null;
  private layers: LayerMode = "Nature + music";
  private exploring = false;

  private constructor(private readonly T: ToneModule) {
    this.master = new T.Volume(0).toDestination();
    this.reverb = new T.Reverb({ decay: 6, wet: 0.5 }).connect(this.master);
    this.delay = new T.FeedbackDelay({ delayTime: "8n", feedback: 0.2, wet: 0.15 }).connect(this.reverb);
    this.filter = new T.Filter({ type: "lowpass", frequency: 2000, Q: 0.7 }).connect(this.delay);
    this.musicBus = new T.Gain(0).connect(this.filter);
    this.natureBus = new T.Gain(0).connect(this.master);
    this.nature = new NatureLayer(T, this.natureBus);
    this.probeSynth = new T.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.005, decay: 0.15, sustain: 0, release: 0.1 },
    }).connect(this.master);
    this.probeSynth.volume.value = -14;
  }

  static async create(): Promise<SonificationEngine> {
    const T = await import("tone");
    await T.start();
    return new SonificationEngine(T);
  }

  private get transport() {
    return this.T.getTransport();
  }

  setPreset(preset: Preset) {
    this.spec = PRESET_SPECS[preset];
    this.pad?.dispose();
    this.lead?.dispose();
    this.pad = this.spec.pad(this.T).connect(this.musicBus);
    this.lead = this.spec.lead(this.T).connect(this.musicBus);
    this.pad.volume.value = this.spec.padLevel;
    this.lead.volume.value = this.spec.leadLevel;
    this.reverb.wet.value = this.spec.reverb;
  }

  setLayers(mode: LayerMode) {
    this.layers = mode;
    this.applyBuses();
  }

  /** Ganancia de cada capa según el modo y si está sonando. */
  private applyBuses(ramp = 0.4) {
    const active = this.isPlaying && !this.exploring;
    const natureOn = this.layers !== "Music only";
    const music = !active || this.layers === "Nature only" ? 0 : natureOn ? MUSIC_UNDER_NATURE : 1;
    const nature = this.exploring ? 1 : active && natureOn ? 1 : 0;
    this.musicBus.gain.rampTo(music, ramp);
    this.natureBus.gain.rampTo(nature, ramp);
  }

  /** 0–100, curva cuadrática para que el control se sienta natural. */
  setVolume(volume: number) {
    const gain = (Math.max(0, Math.min(100, volume)) / 100) ** 2;
    this.master.mute = gain === 0;
    if (gain > 0) this.master.volume.rampTo(this.T.gainToDb(gain), 0.05);
  }

  load(score: Score) {
    this.score = score;
    this.part?.dispose();
    this.part = new this.T.Part<FrameEvent>((time, event) => this.playFrame(time, event), score.events);
    this.part.start(0);
    this.transport.loop = true;
    this.transport.loopStart = 0;
    this.transport.loopEnd = score.duration;
    this.transport.seconds = 0;
    this.applyNatureAt(0);
  }

  private eventAt(seconds: number): FrameEvent | undefined {
    if (!this.score) return undefined;
    const i = Math.floor(seconds / this.score.secondsPerFrame);
    return this.score.events[Math.min(this.score.events.length - 1, Math.max(0, i))];
  }

  private applyNatureAt(seconds: number, ramp = 0.3) {
    const e = this.eventAt(seconds);
    if (e && !this.exploring) {
      this.nature.setLevels(e.nature, undefined, ramp);
      this.nature.setWaterPan(0);
    }
  }

  private playFrame(time: number, e: FrameEvent) {
    if (!this.pad || !this.lead) this.setPreset("Ambient");
    const { repeat, jitterCents } = this.spec;

    if (!this.exploring) this.nature.setLevels(e.nature, time, Math.min(2, e.duration * 0.6));

    this.filter.frequency.rampTo(250 + e.brightness * 4500, Math.min(1, e.duration / 2), time);
    this.delay.feedback.rampTo(0.1 + e.motion * 0.45, 0.5, time);

    this.pad!.triggerAttackRelease(e.chord.map(midiToHz), e.duration * 0.95, time, 0.25 + e.energy * 0.35);

    const slice = e.duration / repeat;
    for (let r = 0; r < repeat; r++) {
      for (const note of e.arpeggio) {
        this.lead!.triggerAttackRelease(
          jitter(midiToHz(note.midi), jitterCents),
          note.duration / repeat,
          time + r * slice + note.offset / repeat,
          note.velocity,
        );
      }
    }
  }

  async play() {
    await this.T.start();
    this.exploring = false;
    this.applyNatureAt(this.transport.seconds);
    this.transport.start();
    this.applyBuses();
  }

  pause() {
    this.transport.pause();
    this.pad?.releaseAll();
    this.lead?.releaseAll();
    this.applyBuses(0.25);
  }

  seek(seconds: number) {
    this.pad?.releaseAll();
    this.lead?.releaseAll();
    const s = Math.max(0, Math.min(seconds, this.score?.duration ?? 0));
    this.transport.seconds = s;
    this.applyNatureAt(s);
  }

  /**
   * Modo Explorar: hace sonar solo el elemento bajo la sonda.
   * x: -1 (izquierda) … 1 (derecha); y: 0 (norte) … 1 (sur).
   * `null` sale del modo Explorar. `beep`: tono corto de latitud.
   */
  async probe(surface: ProbeSurface | null, x = 0, y = 0.5, beep = true) {
    await this.T.start();
    if (surface === null) {
      this.exploring = false;
      this.applyNatureAt(this.transport.seconds);
      this.applyBuses();
      return;
    }
    if (!this.exploring) {
      this.exploring = true;
      this.transport.pause();
      this.pad?.releaseAll();
      this.lead?.releaseAll();
    }
    const solo: NatureLevels = {
      water: surface === "ocean" ? 1 : 0,
      land: surface === "land" ? 1 : 0,
      air: surface === "cloud" ? 1 : 0,
      landPan: x,
      airPan: x,
    };
    this.nature.setLevels(solo, undefined, 0.12);
    this.nature.setWaterPan(x);
    this.applyBuses(0.1);
    // Tono corto: agudo = norte, grave = sur. Más suave sobre el espacio.
    if (beep) {
      this.probeSynth.triggerAttackRelease(midiToHz(84 - y * 24), 0.08, undefined, surface === "space" ? 0.15 : 0.5);
    }
  }

  get isExploring(): boolean {
    return this.exploring;
  }

  get position(): number {
    return this.transport.seconds;
  }

  get isPlaying(): boolean {
    return this.transport.state === "started";
  }

  dispose() {
    this.transport.stop();
    this.transport.cancel();
    this.part?.dispose();
    this.pad?.dispose();
    this.lead?.dispose();
    this.nature.dispose();
    this.probeSynth.dispose();
    this.musicBus.dispose();
    this.natureBus.dispose();
    this.filter.dispose();
    this.delay.dispose();
    this.reverb.dispose();
    this.master.dispose();
  }
}
