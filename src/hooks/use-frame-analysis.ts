import { useEffect, useState } from "react";

import { analyzeImageUrl, type FrameAnalysis } from "@/lib/vision/analyze";

/** Analiza (una vez, en el navegador) los frames del dataset. Clave: URL. */
export function useFrameAnalyses(urls: readonly string[]) {
  const [analyses, setAnalyses] = useState<Record<string, FrameAnalysis>>({});
  const key = urls.join("|");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const url of urls) {
        if (cancelled) return;
        try {
          const a = await analyzeImageUrl(url);
          if (!cancelled) setAnalyses((prev) => ({ ...prev, [url]: a }));
        } catch {
          // imagen no disponible: ese frame queda sin datos espaciales
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return analyses;
}
