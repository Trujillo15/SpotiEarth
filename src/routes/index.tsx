import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Home, Compass, Info, Play, Pause, SkipBack, SkipForward, Volume2, X, AudioWaveform, ChevronRight, Satellite,
} from "lucide-react";
import atmos from "@/assets/atmos.jpg";
import ocean from "@/assets/ocean.jpg";
import thermal from "@/assets/thermal.jpg";
import precip from "@/assets/precip.jpg";

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

const PLAYLISTS = [
  {
    id: "atmos", title: "Atmospheric Dynamics", tag: "Atmosphere", cover: atmos, stage: atmos,
    track: "Jet Streams & Aerosol Flow", date: "October 2026", tracks: 12,
    g: ["oklch(0.22 0.08 300)", "oklch(0.55 0.2 320)", "oklch(0.5 0.18 280)"],
    instrument: "GOES-18 ABI", science: "Water vapor channels (6.2–7.3 µm) reveal the mid- and upper-tropospheric moisture that steers storms. Brighter swirls indicate dense, high-altitude moisture; darker bands mark dry, sinking air.",
    scale: [["oklch(0.35 0.15 290)", "Dry upper air"], ["oklch(0.6 0.2 330)", "Moderate moisture"], ["oklch(0.95 0.02 300)", "Deep convection"]],
  },
  {
    id: "ocean", title: "Ocean Heartbeats", tag: "Hydrosphere", cover: ocean, stage: precip,
    track: "Global Precipitation & Cyclones", date: "October 2026", tracks: 9,
    g: ["oklch(0.2 0.07 250)", "oklch(0.5 0.14 220)", "oklch(0.6 0.12 190)"],
    instrument: "Terra/Aqua MODIS · GPM IMERG", science: "Sea surface temperature and precipitation rates are fused into a single timelapse. Warm currents fuel cyclones; rain bands along the Intertropical Convergence Zone become the rhythmic pulse of this track.",
    scale: [["oklch(0.45 0.2 260)", "< 1 mm/hr"], ["oklch(0.8 0.18 140)", "5–10 mm/hr"], ["oklch(0.62 0.24 28)", "> 20 mm/hr"]],
  },
  {
    id: "thermal", title: "Thermal Anomalies", tag: "Land Surface", cover: thermal, stage: thermal,
    track: "Land Surface Temperature Anomaly", date: "October 2026", tracks: 7,
    g: ["oklch(0.22 0.06 40)", "oklch(0.58 0.16 45)", "oklch(0.68 0.15 65)"],
    instrument: "MODIS MOD11 · VIIRS", science: "Daily land surface temperatures compared against a 2001–2020 baseline. Positive anomalies translate into brighter, higher-pitched tones; cooling regions become low drones.",
    scale: [["oklch(0.2 0.03 40)", "−12 °C"], ["oklch(0.55 0.18 40)", "0 °C"], ["oklch(0.9 0.15 85)", "+12 °C"]],
  },
] as const;

const SYNTHS = ["Ambient", "Pulsing", "Orchestral", "Granular"];
const DURATION = 180;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function Index() {
  const [view, setView] = useState<"home" | "player">("home");
  const [idx, setIdx] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [t, setT] = useState(45);
  const [info, setInfo] = useState(false);
  const [synthOpen, setSynthOpen] = useState(false);
  const [synth, setSynth] = useState("Ambient");
  const [vol, setVol] = useState(70);
  const p = PLAYLISTS[idx]!;

  useEffect(() => {
    if (!playing || view !== "player") return;
    const id = setInterval(() => setT((x) => (x + 1) % DURATION), 1000);
    return () => clearInterval(id);
  }, [playing, view]);

  const open = (i: number) => { setIdx(i); setT(0); setPlaying(true); setView("player"); };
  const bg = { "--g1": p.g[0], "--g2": p.g[1], "--g3": p.g[2] } as React.CSSProperties;

  return (
    <div className="min-h-screen font-sans text-glass overflow-hidden">
      <div className="jb-bg" style={bg} />

      {view === "home" ? (
        <main key="home" className="jb-enter mx-auto max-w-6xl px-6 py-16 md:py-24">
          <div className="glass-light inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs tracking-widest uppercase text-glass-muted">
            <Satellite className="h-3.5 w-3.5" /> NASA Space Apps Challenge 2026
          </div>
          <h1 className="mt-8 font-display text-6xl md:text-8xl leading-none">Earth Jukebox</h1>
          <p className="mt-6 max-w-xl text-lg text-glass-muted">
            Translating NASA's Earth Information Center visual data into dynamic soundscapes using CNNs.
          </p>
          <h2 className="mt-16 mb-6 text-sm uppercase tracking-widest text-glass-muted">Playlists</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {PLAYLISTS.map((pl, i) => (
              <button key={pl.id} onClick={() => open(i)} onMouseEnter={() => setIdx(i)}
                className="glass group rounded-3xl p-4 text-left transition-all duration-500 hover:scale-[1.03] hover:bg-white/20">
                <div className="aspect-square overflow-hidden rounded-2xl">
                  <img src={pl.cover} alt={pl.title} width={1024} height={1024} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
                </div>
                <div className="mt-4 flex items-center justify-between px-1">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-glass-muted">{pl.tag}</p>
                    <p className="mt-1 text-xl font-semibold">{pl.title}</p>
                    <p className="text-sm text-glass-muted">{pl.tracks} soundscapes</p>
                  </div>
                  <span className="glass-light grid h-11 w-11 place-items-center rounded-full opacity-0 transition-opacity group-hover:opacity-100">
                    <Play className="h-4 w-4 fill-current" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </main>
      ) : (
        <div key="player" className="jb-enter flex h-screen flex-col gap-4 p-4">
          <div className="flex min-h-0 flex-1 gap-4">
            <aside className="glass hidden md:flex w-1/4 max-w-xs flex-col rounded-3xl p-5">
              <button onClick={() => setView("home")} className="glass-light flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm">
                <Home className="h-4 w-4" /> Home
              </button>
              <p className="mt-8 font-display text-3xl">Earth Jukebox</p>
              <nav className="mt-6 space-y-1">
                {[{ i: Compass, l: "Discover" }, { i: Info, l: "Project Info" }].map(({ i: I, l }) => (
                  <button key={l} onClick={() => l === "Project Info" && setInfo(true)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-glass-muted transition hover:bg-white/10 hover:text-glass">
                    <I className="h-4 w-4" /> {l}
                  </button>
                ))}
              </nav>
              <p className="mt-8 mb-3 px-3 text-xs uppercase tracking-widest text-glass-muted">Datasets</p>
              <div className="space-y-2">
                {PLAYLISTS.map((pl, i) => (
                  <button key={pl.id} onClick={() => { setIdx(i); setT(0); }}
                    className={`flex w-full items-center gap-3 rounded-2xl p-2 text-left transition ${i === idx ? "bg-white/20 border border-white/25" : "border border-transparent hover:bg-white/10"}`}>
                    <img src={pl.cover} alt="" className="h-11 w-11 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{pl.title}</p>
                      <p className="truncate text-xs text-glass-muted">{pl.tag}</p>
                    </div>
                    {i === idx && <ChevronRight className="h-4 w-4 text-glass-muted" />}
                  </button>
                ))}
              </div>
            </aside>

            <section className="glass relative flex-1 overflow-hidden rounded-3xl">
              <img key={p.id} src={p.stage} alt={p.track} className={`jb-enter jb-pan absolute inset-0 h-full w-full object-cover ${playing ? "" : "jb-pan-paused"}`} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
              <div className="absolute left-6 top-6 glass-light flex items-center gap-2 rounded-full px-4 py-1.5 text-xs uppercase tracking-widest">
                <span className={`h-2 w-2 rounded-full bg-red-400 ${playing ? "animate-pulse" : ""}`} /> Earth Data Timelapse
              </div>
              <button onClick={() => setView("home")} className="md:hidden absolute right-6 top-6 glass-light rounded-full p-2"><Home className="h-4 w-4" /></button>
              <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-glass-muted">{p.title}</p>
                  <p className="font-display text-4xl md:text-5xl">{p.track}</p>
                </div>
                <div className="hidden sm:flex h-10 items-end gap-1">
                  {Array.from({ length: 18 }).map((_, i) => (
                    <span key={i} className="w-1 rounded-full bg-white/80 transition-all duration-300"
                      style={{ height: playing ? `${20 + ((i * 37 + t * 13) % 80)}%` : "15%" }} />
                  ))}
                </div>
              </div>
            </section>
          </div>

          <footer className="glass-strong relative flex h-[10vh] min-h-20 items-center gap-4 rounded-3xl px-4 md:px-6">
            <div className="flex w-1/4 min-w-0 items-center gap-3">
              <img src={p.cover} alt="" className="h-12 w-12 rounded-xl object-cover" />
              <div className="hidden sm:block min-w-0">
                <p className="truncate text-sm font-semibold">{p.track}</p>
                <p className="truncate text-xs text-glass-muted">{p.date}</p>
              </div>
            </div>
            <div className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex items-center gap-5">
                <button onClick={() => { setIdx((idx + 2) % 3); setT(0); }} className="text-glass-muted transition hover:scale-110 hover:text-glass"><SkipBack className="h-5 w-5 fill-current" /></button>
                <button onClick={() => setPlaying(!playing)} className="grid h-12 w-12 place-items-center rounded-full bg-white text-black shadow-lg transition hover:scale-105">
                  {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
                </button>
                <button onClick={() => { setIdx((idx + 1) % 3); setT(0); }} className="text-glass-muted transition hover:scale-110 hover:text-glass"><SkipForward className="h-5 w-5 fill-current" /></button>
              </div>
              <div className="flex w-full max-w-lg items-center gap-3 text-[11px] tabular-nums text-glass-muted">
                <span>{fmt(t)}</span>
                <input type="range" min={0} max={DURATION} value={t} onChange={(e) => setT(+e.target.value)} className="h-1 flex-1 cursor-pointer accent-white" />
                <span>{fmt(DURATION)}</span>
              </div>
            </div>
            <div className="flex w-1/4 items-center justify-end gap-2">
              <div className="relative">
                <button onClick={() => setSynthOpen(!synthOpen)} className="glass-light flex items-center gap-2 rounded-full px-3 py-2 text-xs">
                  <AudioWaveform className="h-4 w-4" /> <span className="hidden lg:inline">{synth}</span>
                </button>
                {synthOpen && (
                  <div className="glass-strong jb-enter absolute bottom-14 right-0 w-48 rounded-2xl p-2">
                    <p className="px-3 py-2 text-[10px] uppercase tracking-widest text-glass-muted">Synthesizer</p>
                    {SYNTHS.map((s) => (
                      <button key={s} onClick={() => { setSynth(s); setSynthOpen(false); }}
                        className={`w-full rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white/15 ${s === synth ? "bg-white/20" : ""}`}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="hidden lg:flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-glass-muted" />
                <input type="range" min={0} max={100} value={vol} onChange={(e) => setVol(+e.target.value)} className="h-1 w-20 accent-white" />
              </div>
              <button onClick={() => setInfo(true)} className="glass-light rounded-full p-2"><Info className="h-4 w-4" /></button>
            </div>
          </footer>

          <div onClick={() => setInfo(false)} className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-500 ${info ? "opacity-100" : "pointer-events-none opacity-0"}`} />
          <aside className={`glass-strong fixed bottom-4 right-4 top-4 z-50 w-[min(420px,calc(100vw-2rem))] overflow-y-auto rounded-3xl p-7 transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${info ? "translate-x-0" : "translate-x-[110%]"}`}>
            <button onClick={() => setInfo(false)} className="glass-light absolute right-5 top-5 rounded-full p-2"><X className="h-4 w-4" /></button>
            <p className="text-xs uppercase tracking-widest text-glass-muted">Metadata & Science</p>
            <h3 className="mt-2 font-display text-4xl leading-tight">{p.track}</h3>
            <img src={p.stage} alt="" className="mt-6 aspect-video w-full rounded-2xl object-cover" />
            <div className="mt-6 space-y-6 text-sm leading-relaxed">
              <div>
                <p className="text-xs uppercase tracking-widest text-glass-muted">What you're seeing</p>
                <p className="mt-2">{p.science}</p>
              </div>
              <div className="glass-light rounded-2xl p-4">
                <p className="text-xs uppercase tracking-widest text-glass-muted">Instrument</p>
                <p className="mt-1 flex items-center gap-2 font-semibold"><Satellite className="h-4 w-4" /> {p.instrument}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-glass-muted">Color scale</p>
                <div className="mt-3 h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${p.scale.map((s) => s[0]).join(",")})` }} />
                <div className="mt-3 space-y-2">
                  {p.scale.map(([c, l]) => (
                    <div key={l} className="flex items-center gap-3"><span className="h-3 w-3 rounded-full" style={{ background: c }} /> {l}</div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-glass-muted">Sonification</p>
                <p className="mt-2">A convolutional neural network extracts texture, motion and intensity from each frame. These features drive pitch, rhythm and timbre in the <b>{synth}</b> synthesizer.</p>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
