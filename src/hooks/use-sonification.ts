import { useCallback, useEffect, useRef, useState } from "react";

import type { Score } from "@/lib/sonification/mapping";
import type { LayerMode, Preset, ProbeSurface, SonificationEngine } from "@/lib/sonification/engine";

/**
 * Controla la reproducción de un `Score` con Tone.js.
 * El motor se crea en el primer `play()` (debe llamarse desde un clic).
 */
export function useSonification(score: Score | null, preset: Preset, volume: number, layers: LayerMode = "Nature + music") {
  const engineRef = useRef<SonificationEngine | null>(null);
  const creatingRef = useRef<Promise<SonificationEngine> | null>(null);
  const settingsRef = useRef({ score, preset, volume, layers });
  settingsRef.current = { score, preset, volume, layers };

  const [isPlaying, setIsPlaying] = useState(false);
  const [isExploring, setIsExploring] = useState(false);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const getEngine = useCallback(async () => {
    if (engineRef.current) return engineRef.current;
    creatingRef.current ??= import("@/lib/sonification/engine").then(async ({ SonificationEngine }) => {
      const engine = await SonificationEngine.create();
      const { score: s, preset: p, volume: v, layers: l } = settingsRef.current;
      engine.setPreset(p);
      engine.setLayers(l);
      engine.setVolume(v);
      if (s) engine.load(s);
      engineRef.current = engine;
      return engine;
    });
    return creatingRef.current;
  }, []);

  const play = useCallback(async () => {
    try {
      const engine = await getEngine();
      await engine.play();
      setIsPlaying(true);
      setIsExploring(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar el audio");
    }
  }, [getEngine]);

  const pause = useCallback(() => {
    engineRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => (isPlaying ? pause() : void play()), [isPlaying, pause, play]);

  /** Modo Explorar: suena solo lo que hay bajo la sonda (pausa el timelapse). */
  const probe = useCallback(
    async (surface: ProbeSurface, x: number, y: number, beep = true) => {
      try {
        const engine = await getEngine();
        await engine.probe(surface, x, y, beep);
        setIsPlaying(false);
        setIsExploring(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo iniciar el audio");
      }
    },
    [getEngine],
  );

  const endExplore = useCallback(() => {
    void engineRef.current?.probe(null);
    setIsExploring(false);
  }, []);

  const seek = useCallback((seconds: number) => {
    engineRef.current?.seek(seconds);
    setPosition(seconds);
  }, []);

  // Nuevo score (llegaron los datos o el análisis espacial): recargar
  // conservando la posición, para no saltar al inicio a mitad de la escucha.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !score) return;
    const wasPlaying = engine.isPlaying;
    const keep = Math.min(engine.position, Math.max(0, score.duration - 0.01));
    engine.pause();
    engine.load(score);
    engine.seek(keep);
    if (wasPlaying) void engine.play();
    setPosition(keep);
  }, [score]);

  useEffect(() => engineRef.current?.setPreset(preset), [preset]);
  useEffect(() => engineRef.current?.setVolume(volume), [volume]);
  useEffect(() => engineRef.current?.setLayers(layers), [layers]);

  // Posición para la UI, ~8 veces por segundo mientras suena.
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => setPosition(engineRef.current?.position ?? 0), 125);
    return () => clearInterval(id);
  }, [isPlaying]);

  useEffect(
    () => () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      creatingRef.current = null;
    },
    [],
  );

  const duration = score?.duration ?? 0;
  const frameCount = score?.events.length ?? 0;
  const frameIndex =
    score && frameCount ? Math.min(frameCount - 1, Math.floor(position / score.secondsPerFrame)) : 0;

  return {
    play,
    pause,
    toggle,
    seek,
    probe,
    endExplore,
    isPlaying,
    isExploring,
    position,
    duration,
    frameIndex,
    currentEvent: score?.events[frameIndex] ?? null,
    error,
  };
}
