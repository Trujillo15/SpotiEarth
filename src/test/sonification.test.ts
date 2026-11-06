import { describe, expect, it } from "vitest";

import { mockTimelapse } from "@/lib/api/mock";
import { SCALES, buildScore, degreeToMidi } from "@/lib/sonification/mapping";

const frame = (frame_index: number, latent_vector: number[]) => ({ frame_index, frame_id: `f${frame_index}.png`, latent_vector });

describe("mapeo de vectores a música", () => {
  it("genera un evento por frame con la duración correcta", () => {
    const score = buildScore(mockTimelapse.frames, { secondsPerFrame: 3 });
    expect(score.events).toHaveLength(13);
    expect(score.duration).toBe(39);
    expect(score.events[2]?.time).toBe(6);
  });

  it("todas las notas pertenecen a la escala elegida", () => {
    const root = 45;
    const allowed = new Set<number>(SCALES.minorPentatonic);
    const score = buildScore(mockTimelapse.frames, { scale: "minorPentatonic", rootMidi: root });
    for (const e of score.events) {
      for (const midi of [...e.chord, ...e.arpeggio.map((n) => n.midi)]) {
        expect(allowed.has((((midi - root) % 12) + 12) % 12)).toBe(true);
      }
    }
  });

  it("v[0] más alto da un acorde más agudo y v[2] más alto más notas", () => {
    const low = buildScore([frame(0, [0, 0.5, 0, 0.5])]).events[0]!;
    const high = buildScore([frame(0, [1, 0.5, 1, 0.5])]).events[0]!;
    expect(high.chord[0]!).toBeGreaterThan(low.chord[0]!);
    expect(low.arpeggio).toHaveLength(2);
    expect(high.arpeggio).toHaveLength(8);
  });

  it("el movimiento refleja el cambio entre frames", () => {
    const score = buildScore([frame(0, [0, 0, 0, 0]), frame(1, [0, 0, 0, 0]), frame(2, [1, 1, 1, 1])]);
    expect(score.events[0]?.motion).toBe(0);
    expect(score.events[1]?.motion).toBe(0);
    expect(score.events[2]?.motion).toBe(1);
  });

  it("acepta vectores de cualquier tamaño y valores fuera de rango", () => {
    const sixteen = Array.from({ length: 16 }, (_, i) => i / 15);
    expect(() => buildScore([frame(0, sixteen), frame(1, [2, -1, Number.NaN])])).not.toThrow();
  });

  it("degreeToMidi recorre octavas", () => {
    expect(degreeToMidi(SCALES.pentatonicMajor, 60, 0)).toBe(60);
    expect(degreeToMidi(SCALES.pentatonicMajor, 60, 5)).toBe(72);
    expect(degreeToMidi(SCALES.pentatonicMajor, 60, -1)).toBe(57);
  });
});
