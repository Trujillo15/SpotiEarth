import { describe, expect, it } from "vitest";

import { mockTimelapse } from "@/lib/api/mock";
import { EPIC_DATASET } from "@/lib/datasets";
import { buildScore, natureLevels } from "@/lib/sonification/mapping";
import { analyzePixels, classifyPixel, describePosition } from "@/lib/vision/analyze";

describe("niveles de agua / tierra / aire desde el vector del motor", () => {
  const sem = EPIC_DATASET.semantics;

  it("PC1 alta = más agua, PC1 baja = más tierra", () => {
    const sea = natureLevels([0.95, 0.5, 0.5, 0.5, 0.5], sem);
    const land = natureLevels([0.05, 0.5, 0.5, 0.5, 0.5], sem);
    expect(sea.water).toBeGreaterThan(0.9);
    expect(land.land).toBeGreaterThan(0.9);
    expect(sea.water + sea.land).toBeCloseTo(1);
  });

  it("PC5 está invertida: valor bajo = más nubes (viento)", () => {
    expect(natureLevels([0.5, 0.5, 0.5, 0.5, 0.1], sem).air).toBeCloseTo(0.9);
  });

  it("con los vectores reales, el frame con más tierra es el del medio (África) y el último es casi todo océano", () => {
    const events = buildScore(mockTimelapse.frames, { semantics: sem }).events;
    const landiest = events.reduce((a, e) => (e.nature.land > a.nature.land ? e : a));
    expect(landiest.frameIndex).toBeGreaterThanOrEqual(3);
    expect(landiest.frameIndex).toBeLessThanOrEqual(6);
    expect(events.at(-1)!.nature.water).toBeGreaterThan(0.9);
  });

  it("usa el paneo del análisis de imagen cuando existe", () => {
    const lv = natureLevels([0.5], sem, { landPan: -0.6, cloudPan: 0.4 });
    expect(lv.landPan).toBe(-0.6);
    expect(lv.airPan).toBe(0.4);
  });
});

describe("análisis de color", () => {
  it("clasifica píxeles típicos de EPIC", () => {
    expect(classifyPixel(5, 5, 8)).toBe("space");
    expect(classifyPixel(230, 232, 235)).toBe("cloud");
    expect(classifyPixel(30, 60, 110)).toBe("ocean");
    expect(classifyPixel(150, 110, 70)).toBe("land");
  });

  it("ubica la tierra a la izquierda si está a la izquierda del disco", () => {
    const size = 48;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const [r, g, b] = x < size / 2 ? [150, 110, 70] : [30, 60, 110];
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
      }
    }
    const a = analyzePixels(data, size, size, 8);
    expect(a.fractions.land).toBeCloseTo(0.5, 1);
    expect(a.pan.land).toBeLessThan(-0.2);
    expect(a.pan.ocean).toBeGreaterThan(0.2);
    expect(a.cells[0]![0]).toBe("space");
    expect(a.cells[4]![2]).toBe("land");
  });

  it("describe posiciones", () => {
    expect(describePosition(0, 0, 24)).toBe("north-west");
    expect(describePosition(12, 12, 24)).toBe("center");
    expect(describePosition(23, 12, 24)).toBe("south");
  });
});
