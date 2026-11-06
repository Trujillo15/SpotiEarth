import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Home, Info, Play, Pause, SkipBack, SkipForward, Volume2, X, AudioWaveform, ChevronRight, Satellite, Compass,
} from "lucide-react";
import { useTimelapse } from "@/hooks/use-spotiearth";
import { useSonification } from "@/hooks/use-sonification";
import { useFrameAnalyses } from "@/hooks/use-frame-analysis";
import { ApiError, USE_MOCK_API } from "@/lib/api";
import { mockTimelapse } from "@/lib/api/mock";
import { EPIC_DATASET as DS, frameImageUrl } from "@/lib/datasets";
import { buildScore, type FrameSpatial } from "@/lib/sonification/mapping";
import { LAYER_MODES, PRESETS, type LayerMode, type Preset } from "@/lib/sonification/engine";
import { describeFrame, describePosition, surfaceName } from "@/lib/vision/analyze";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Earth Jukebox — NASA Earth data as sound" },
      { name: "description", content: "Translating NASA's Earth Information Center visual data into dynamic soundscapes using CNNs." },
      { property: "og:title", content: "Earth Jukebox" },
      { property: "og:description", content: "Listen to the planet: NASA Earth data turned into soundscapes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const pcLabel = (pc: number) => `PC${pc + 1}`;

/** Qué controla cada fuente de datos (ver lib/sonification/mapping.ts y nature.ts). */
const SOUND_MAP = [
  [pcLabel(DS.semantics.oceanVsLand.pc), "Water ↔ land — waves when the disk shows more ocean, a deep rumble when more land", "engine"],
  [pcLabel(DS.semantics.clouds.pc), "Wind — more cloud cover, stronger wind", "engine"],
  ["Image", "Position — land and clouds sound left or right where they are on the disk", "image"],
  ["Other PCs", "Background music — chord, brightness, rhythm and melody", "engine"],
] as const;

const SHORTCUTS = [
  ["Space", "Play / pause"],
  ["← →", "Previous / next frame"],
  ["E", "Explore mode: arrows move the probe (Shift = faster)"],
  ["D", "Describe the current frame"],
  ["Esc", "Leave explore mode"],
] as const;

const cover = frameImageUrl(DS, DS.coverFrame);
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function Index() {
  const [view, setView] = useState<"home" | "player">("home");
  const [info, setInfo] = useState(false);
  const [synthOpen, setSynthOpen] = useState(false);
  const [synth, setSynth] = useState<Preset>("Ambient");
  const [layers, setLayers] = useState<LayerMode>("Nature + music");
  const [vol, setVol] = useState(70);
  const [probeCell, setProbeCell] = useState<{ row: number; col: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const stageRef = useRef<HTMLElement>(null);

  // Vectores latentes del backend; si no responde, los vectores pre-calculados del motor.
  const timelapseQuery = useTimelapse();
  const timelapse = timelapseQuery.data ?? (timelapseQuery.isError ? mockTimelapse : undefined);
  const isDemo = USE_MOCK_API || (!timelapseQuery.data && timelapseQuery.isError);
  const warmingUp = timelapseQuery.failureReason instanceof ApiError && timelapseQuery.failureReason.isWarmingUp;

  // Mientras llega la respuesta se muestran igualmente los frames del dataset.
  const frames = (timelapse ?? mockTimelapse).frames;
  const frameCount = frames.length;
  const frameUrls = useMemo(() => frames.map((f) => frameImageUrl(DS, f.frame_id)), [frames]);

  // Análisis de color (dónde está cada cosa): solo para paneo, Explorar y descripciones.
  const analyses = useFrameAnalyses(frameUrls);
  const spatial = useMemo(() => {
    const out: Record<string, FrameSpatial> = {};
    frames.forEach((f, i) => {
      const a = analyses[frameUrls[i]!];
      if (a) out[f.frame_id] = { landPan: a.pan.land, cloudPan: a.pan.cloud };
    });
    return out;
  }, [analyses, frames, frameUrls]);

  const score = useMemo(
    () => (timelapse ? buildScore(timelapse.frames, { scale: DS.scale, rootMidi: DS.rootMidi, semantics: DS.semantics, spatial }) : null),
    [timelapse, spatial],
  );
  const sono = useSonification(score, synth, vol, layers);
  const playing = sono.isPlaying;
  const exploring = sono.isExploring;
  const t = sono.position;
  const duration = sono.duration;
  const event = sono.currentEvent;
  const frameVector = event?.vector ?? [];

  const current = Math.min(sono.frameIndex, frameCount - 1);
  const analysis = analyses[frameUrls[current] ?? ""];
  const describeCurrent = () =>
    `Frame ${current + 1} of ${frameCount}${analysis ? `: ${describeFrame(analysis)}` : ""}`;

  const status = timelapseQuery.isPending
    ? warmingUp ? "Engine warming up…" : "Processing frames…"
    : exploring ? "Exploring" : isDemo ? `Offline vectors · Frame ${current + 1}/${frameCount}` : `Frame ${current + 1}/${frameCount}`;

  const step = (delta: number) => {
    if (!score) return;
    const next = (current + delta + frameCount) % frameCount;
    sono.seek(next * score.secondsPerFrame);
    const a = analyses[frameUrls[next] ?? ""];
    setAnnouncement(`Frame ${next + 1} of ${frameCount}${a ? `: ${describeFrame(a)}` : ""}`);
  };

  // ---- Modo Explorar ----
  const probeAt = useCallback(
    (row: number, col: number, beep: boolean) => {
      if (!analysis) return;
      const g = analysis.gridSize;
      const r = Math.max(0, Math.min(g - 1, row));
      const c = Math.max(0, Math.min(g - 1, col));
      const surface = analysis.cells[r]?.[c] ?? "space";
      setProbeCell({ row: r, col: c });
      void sono.probe(surface, ((c + 0.5) / g) * 2 - 1, (r + 0.5) / g, beep);
      setAnnouncement(`${surfaceName(surface)}, ${describePosition(r, c, g)}`);
    },
    [analysis, sono],
  );

  const startExplore = () => {
    if (!analysis) {
      setAnnouncement("Explore mode is still loading this frame");
      return;
    }
    const mid = Math.floor(analysis.gridSize / 2);
    probeAt(mid, mid, true);
  };
  const stopExplore = () => {
    sono.endExplore();
    setProbeCell(null);
    setAnnouncement("Explore mode off");
  };

  const onStagePointer = (e: React.PointerEvent<HTMLElement>) => {
    if (!exploring || !analysis || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const side = Math.min(rect.width, rect.height) - 48; // p-6 de la imagen
    const left = rect.left + (rect.width - side) / 2;
    const top = rect.top + (rect.height - side) / 2;
    const g = analysis.gridSize;
    const col = Math.floor(((e.clientX - left) / side) * g);
    const row = Math.floor(((e.clientY - top) / side) * g);
    if (row === probeCell?.row && col === probeCell?.col) return;
    probeAt(row, col, true);
  };

  // ---- Atajos de teclado ----
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (view !== "player") return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, select")) return;
    const onButton = !!target?.closest("button");
    const k = e.key;
    if (k === " " && !onButton) {
      e.preventDefault();
      if (exploring) stopExplore();
      sono.toggle();
    } else if (k === "e" || k === "E") {
      exploring ? stopExplore() : startExplore();
    } else if (k === "d" || k === "D") {
      setAnnouncement(describeCurrent());
    } else if (k === "Escape") {
      if (exploring) stopExplore();
      setInfo(false);
      setSynthOpen(false);
    } else if (k.startsWith("Arrow")) {
      e.preventDefault();
      if (exploring && probeCell) {
        const d = e.shiftKey ? 3 : 1;
        const dr = k === "ArrowUp" ? -d : k === "ArrowDown" ? d : 0;
        const dc = k === "ArrowLeft" ? -d : k === "ArrowRight" ? d : 0;
        probeAt(probeCell.row + dr, probeCell.col + dc, true);
      } else if (k === "ArrowLeft") step(-1);
      else if (k === "ArrowRight") step(1);
    }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const open = () => { setView("player"); void sono.play(); };
  const goHome = () => { sono.pause(); if (exploring) stopExplore(); setView("home"); };
  const bg = { "--g1": DS.gradient[0], "--g2": DS.gradient[1], "--g3": DS.gradient[2] } as React.CSSProperties;

  const probeStyle = probeCell && analysis
    ? { left: `${((probeCell.col + 0.5) / analysis.gridSize) * 100}%`, top: `${((probeCell.row + 0.5) / analysis.gridSize) * 100}%` }
    : undefined;

  return (
    <div className="min-h-screen font-sans text-glass overflow-hidden">
      <div className="jb-bg" style={bg} />
      <p className="sr-only" aria-live="polite">{announcement}</p>

      {view === "home" ? (
        <main key="home" className="jb-enter mx-auto max-w-6xl px-6 py-16 md:py-24">
          <div className="glass-light inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs tracking-widest uppercase text-glass-muted">
            <Satellite className="h-3.5 w-3.5" /> NASA Space Apps Challenge 2026
          </div>
          <h1 className="mt-8 font-display text-6xl md:text-8xl leading-none">Earth Jukebox</h1>
          <p className="mt-6 max-w-xl text-lg text-glass-muted">
            Translating NASA's Earth Information Center visual data into dynamic soundscapes using CNNs.
          </p>
          <h2 className="mt-16 mb-6 text-sm uppercase tracking-widest text-glass-muted">Dataset</h2>
          <button onClick={open}
            className="glass group grid w-full gap-6 rounded-3xl p-4 text-left transition-all duration-500 hover:scale-[1.01] hover:bg-white/20 md:grid-cols-[minmax(0,22rem)_1fr] md:p-5">
            <div className="aspect-square overflow-hidden rounded-2xl bg-black">
              <img src={cover} alt="Full disk of the Earth seen by NASA EPIC" width={1024} height={1024} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
            </div>
            <div className="flex flex-col justify-between gap-6 px-1 py-2">
              <div>
                <p className="text-xs uppercase tracking-widest text-glass-muted">{DS.tag}</p>
                <p className="mt-2 font-display text-4xl md:text-5xl">{DS.title}</p>
                <p className="mt-1 text-glass-muted">{DS.subtitle}</p>
                <p className="mt-6 max-w-lg text-sm leading-relaxed text-glass-muted">{DS.science}</p>
                <p className="mt-4 max-w-lg text-sm leading-relaxed text-glass-muted">
                  Listen to the planet: ocean sounds like waves, land like a deep rumble and clouds like wind. Headphones recommended.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-white text-black shadow-lg transition group-hover:scale-105">
                  <Play className="ml-0.5 h-5 w-5 fill-current" />
                </span>
                <div className="text-sm">
                  <p className="font-semibold">{DS.track}</p>
                  <p className="text-glass-muted">{frameCount} frames · sonified with MobileNetV2 + PCA</p>
                </div>
              </div>
            </div>
          </button>
        </main>
      ) : (
        <div key="player" className="jb-enter flex h-screen flex-col gap-4 p-4">
          <div className="flex min-h-0 flex-1 gap-4">
            <aside className="glass hidden md:flex w-1/4 max-w-xs flex-col rounded-3xl p-5">
              <button onClick={goHome} className="glass-light flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm">
                <Home className="h-4 w-4" /> Home
              </button>
              <p className="mt-8 font-display text-3xl">Earth Jukebox</p>
              <nav className="mt-6 space-y-1">
                <button onClick={() => setInfo(true)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-glass-muted transition hover:bg-white/10 hover:text-glass">
                  <Info className="h-4 w-4" /> Project Info
                </button>
              </nav>
              <p className="mt-8 mb-3 px-3 text-xs uppercase tracking-widest text-glass-muted">Frames</p>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                {frames.map((f, i) => {
                  const a = analyses[frameUrls[i]!];
                  return (
                    <button key={f.frame_id} onClick={() => step(i - current)} disabled={!score}
                      aria-current={i === current ? "true" : undefined}
                      aria-label={`Frame ${i + 1}${a ? `: ${describeFrame(a)}` : ""}`}
                      className={`flex w-full items-center gap-3 rounded-2xl p-1.5 text-left transition ${i === current ? "bg-white/20 border border-white/25" : "border border-transparent hover:bg-white/10"}`}>
                      <img src={frameUrls[i]} alt="" loading="lazy" className="h-10 w-10 rounded-xl bg-black object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">Frame {i + 1}</p>
                        <p className="truncate text-xs text-glass-muted">
                          {a ? `${Math.round(a.fractions.ocean * 100)}% ocean · ${Math.round(a.fractions.land * 100)}% land` : f.frame_id}
                        </p>
                      </div>
                      {i === current && <ChevronRight className="h-4 w-4 text-glass-muted" />}
                    </button>
                  );
                })}
              </div>
            </aside>

            <section ref={stageRef} onPointerMove={onStagePointer} onPointerDown={onStagePointer}
              style={{ containerType: "size" }}
              className={`glass relative flex-1 overflow-hidden rounded-3xl bg-black/60 ${exploring ? "cursor-crosshair touch-none" : ""}`}>
              {/* Timelapse: todos los frames apilados; el actual se muestra con fundido. */}
              {frames.map((f, i) => (
                <img key={f.frame_id} src={frameUrls[i]} alt={i === current ? `Earth seen by EPIC, frame ${i + 1} of ${frameCount}` : ""}
                  aria-hidden={i !== current}
                  className={`absolute inset-0 h-full w-full object-contain p-6 transition-opacity duration-1000 ${i === current ? "opacity-100" : "opacity-0"}`} />
              ))}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

              {/* Sonda del modo Explorar, sobre el cuadrado donde se dibuja el disco. */}
              {exploring && probeStyle && (
                <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square -translate-x-1/2 -translate-y-1/2"
                  style={{ width: "calc(100cqmin - 48px)" }}>
                  <span className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_3px_rgba(0,0,0,0.5)]" style={probeStyle} />
                </div>
              )}

              <div className="pointer-events-none absolute left-6 top-6 glass-light flex items-center gap-2 rounded-full px-4 py-1.5 text-xs uppercase tracking-widest">
                <span className={`h-2 w-2 rounded-full bg-red-400 ${playing ? "animate-pulse" : ""}`} /> Earth Data Timelapse
                <span className="text-glass-muted normal-case tracking-normal">· {status}</span>
              </div>
              {exploring && (
                <div className="pointer-events-none absolute right-6 top-6 glass-light rounded-full px-4 py-1.5 text-xs">{announcement}</div>
              )}
              <button onClick={goHome} className="md:hidden absolute right-6 top-6 glass-light rounded-full p-2" aria-label="Home"><Home className="h-4 w-4" /></button>
              <div className="pointer-events-none absolute bottom-6 left-6 right-6 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-glass-muted">{DS.title}</p>
                  <p className="font-display text-4xl md:text-5xl">{DS.track}</p>
                </div>
                {event && !exploring && (
                  <div className="hidden sm:flex items-end gap-3 text-[10px] uppercase tracking-widest text-glass-muted" aria-hidden>
                    {([["Water", event.nature.water], ["Land", event.nature.land], ["Wind", event.nature.air]] as const).map(([l, v]) => (
                      <div key={l} className="flex flex-col items-center gap-1">
                        <div className="flex h-10 w-2 items-end overflow-hidden rounded-full bg-white/15">
                          <span className="w-full rounded-full bg-white/85 transition-all duration-700" style={{ height: `${playing ? 8 + v * 92 : 8}%` }} />
                        </div>
                        {l}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          <footer className="glass-strong relative flex h-[10vh] min-h-20 items-center gap-4 rounded-3xl px-4 md:px-6">
            <div className="flex w-1/4 min-w-0 items-center gap-3">
              <img src={frameUrls[current] ?? cover} alt="" className="h-12 w-12 rounded-xl bg-black object-cover" />
              <div className="hidden sm:block min-w-0">
                <p className="truncate text-sm font-semibold">{DS.track}</p>
                <p className="truncate text-xs text-glass-muted">{DS.subtitle}</p>
              </div>
            </div>
            <div className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex items-center gap-5">
                <button onClick={() => step(-1)} disabled={!score} aria-label="Previous frame" className="text-glass-muted transition hover:scale-110 hover:text-glass"><SkipBack className="h-5 w-5 fill-current" /></button>
                <button onClick={() => { if (exploring) stopExplore(); sono.toggle(); }} disabled={!score} aria-label={playing ? "Pause" : "Play"} className="grid h-12 w-12 place-items-center rounded-full bg-white text-black shadow-lg transition hover:scale-105 disabled:opacity-50">
                  {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
                </button>
                <button onClick={() => step(1)} disabled={!score} aria-label="Next frame" className="text-glass-muted transition hover:scale-110 hover:text-glass"><SkipForward className="h-5 w-5 fill-current" /></button>
              </div>
              <div className="flex w-full max-w-lg items-center gap-3 text-[11px] tabular-nums text-glass-muted">
                <span>{fmt(t)}</span>
                <input type="range" min={0} max={duration} step={0.1} value={Math.min(t, duration)} onChange={(e) => sono.seek(+e.target.value)} aria-label="Seek" className="h-1 flex-1 cursor-pointer accent-white" />
                <span>{fmt(duration)}</span>
              </div>
            </div>
            <div className="flex w-1/4 items-center justify-end gap-2">
              <button onClick={() => (exploring ? stopExplore() : startExplore())} aria-pressed={exploring} aria-label="Explore mode (E)"
                className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs transition ${exploring ? "bg-white text-black" : "glass-light"}`}>
                <Compass className="h-4 w-4" /> <span className="hidden lg:inline">Explore</span>
              </button>
              <div className="relative">
                <button onClick={() => setSynthOpen(!synthOpen)} aria-label="Sound settings" aria-expanded={synthOpen} className="glass-light flex items-center gap-2 rounded-full px-3 py-2 text-xs">
                  <AudioWaveform className="h-4 w-4" /> <span className="hidden lg:inline">{synth}</span>
                </button>
                {synthOpen && (
                  <div className="glass-strong jb-enter absolute bottom-14 right-0 w-52 rounded-2xl p-2">
                    <p className="px-3 py-2 text-[10px] uppercase tracking-widest text-glass-muted">Sound</p>
                    {LAYER_MODES.map((m) => (
                      <button key={m} onClick={() => setLayers(m)} aria-pressed={m === layers}
                        className={`w-full rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white/15 ${m === layers ? "bg-white/20" : ""}`}>{m}</button>
                    ))}
                    <p className="mt-1 px-3 py-2 text-[10px] uppercase tracking-widest text-glass-muted">Music synthesizer</p>
                    {PRESETS.map((s) => (
                      <button key={s} onClick={() => { setSynth(s); setSynthOpen(false); }} aria-pressed={s === synth}
                        className={`w-full rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white/15 ${s === synth ? "bg-white/20" : ""}`}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="hidden lg:flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-glass-muted" />
                <input type="range" min={0} max={100} value={vol} onChange={(e) => setVol(+e.target.value)} aria-label="Volume" className="h-1 w-20 accent-white" />
              </div>
              <button onClick={() => setInfo(true)} aria-label="Dataset info" className="glass-light rounded-full p-2"><Info className="h-4 w-4" /></button>
            </div>
          </footer>

          <div onClick={() => setInfo(false)} className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-500 ${info ? "opacity-100" : "pointer-events-none opacity-0"}`} />
          <aside aria-hidden={!info} className={`glass-strong fixed bottom-4 right-4 top-4 z-50 w-[min(420px,calc(100vw-2rem))] overflow-y-auto rounded-3xl p-7 transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${info ? "translate-x-0" : "translate-x-[110%]"}`}>
            <button onClick={() => setInfo(false)} aria-label="Close" className="glass-light absolute right-5 top-5 rounded-full p-2"><X className="h-4 w-4" /></button>
            <p className="text-xs uppercase tracking-widest text-glass-muted">Metadata & Science</p>
            <h3 className="mt-2 font-display text-4xl leading-tight">{DS.track}</h3>
            <img src={frameUrls[current] ?? cover} alt="" className="mt-6 aspect-video w-full rounded-2xl bg-black object-contain" />
            <div className="mt-6 space-y-6 text-sm leading-relaxed">
              <div>
                <p className="text-xs uppercase tracking-widest text-glass-muted">What you're seeing</p>
                <p className="mt-2">{DS.science}</p>
                {analysis && <p className="mt-2 text-glass-muted">Now: {describeCurrent()}.</p>}
              </div>
              <div className="glass-light rounded-2xl p-4">
                <p className="text-xs uppercase tracking-widest text-glass-muted">Instrument</p>
                <p className="mt-1 flex items-center gap-2 font-semibold"><Satellite className="h-4 w-4" /> {DS.instrument}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-glass-muted">How the engine listens</p>
                <p className="mt-2">
                  Each frame is masked to the Earth's disk and passed through MobileNetV2, a convolutional neural network, which turns it into
                  1,280 visual features. PCA compresses them into {timelapse?.dataset_info.n_components ?? 8} values. Nobody told the network what
                  water is, yet its first component follows the share of ocean versus land almost exactly, so it drives the sound of the sea and the land.
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-glass-muted">Sound map</p>
                <ul className="mt-3 space-y-2">
                  {SOUND_MAP.map(([k, v, src]) => (
                    <li key={k} className="flex gap-3">
                      <span className="w-20 shrink-0 font-semibold">{k}</span>
                      <span className="text-glass-muted">{v}{src === "image" && " (colour analysis in the browser)"}</span>
                    </li>
                  ))}
                </ul>
                {event && (
                  <p className="mt-3 text-glass-muted tabular-nums">
                    This frame: water {event.nature.water.toFixed(2)} · land {event.nature.land.toFixed(2)} · wind {event.nature.air.toFixed(2)}
                    {frameVector.length > 0 && ` · ${pcLabel(DS.semantics.oceanVsLand.pc)} ${frameVector[DS.semantics.oceanVsLand.pc]?.toFixed(2)}`}
                  </p>
                )}
                {sono.error && <p className="mt-2 text-red-300">Audio error: {sono.error}</p>}
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-glass-muted">Keyboard</p>
                <ul className="mt-3 space-y-1.5">
                  {SHORTCUTS.map(([k, v]) => (
                    <li key={k} className="flex gap-3"><kbd className="w-14 shrink-0 font-semibold">{k}</kbd><span className="text-glass-muted">{v}</span></li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
