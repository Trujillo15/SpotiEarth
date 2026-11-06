import type { Health, Timelapse } from "./types";

/**
 * Respaldo cuando el backend no responde: vectores REALES calculados por el
 * motor (MobileNetV2 + PCA de 8 componentes) sobre los 13 frames NASA EPIC.
 * Copiados de `app/ml_engine/vectores_latentes.json` del backend v1.
 */
const VECTORS: number[][] = [
  [0.5770, 0.8675, 0.1867, 0.7344, 0.5642, 0.6758, 0.7566, 0.0000],
  [0.4296, 0.9518, 0.1411, 0.7830, 0.6120, 0.6516, 0.5926, 0.5085],
  [0.3391, 0.6266, 0.4142, 0.9980, 0.3642, 0.5459, 0.6884, 0.7067],
  [0.2883, 0.3899, 0.5707, 1.0000, 0.2443, 0.4970, 0.5144, 0.2883],
  [0.0570, 0.7722, 0.1882, 0.4443, 0.2182, 0.5528, 0.0825, 0.4176],
  [0.1526, 0.9095, 0.1836, 0.3862, 0.3619, 0.2609, 0.0000, 0.4233],
  [0.3042, 0.7691, 0.6409, 0.5421, 0.4529, 0.3819, 0.2104, 0.6374],
  [0.3558, 0.5255, 0.4597, 0.8480, 0.0837, 0.5112, 0.2583, 0.5638],
  [0.4130, 0.4164, 0.3589, 0.8579, 0.0000, 0.7280, 0.4164, 0.6085],
  [0.4061, 0.3248, 0.0235, 0.9037, 0.2458, 0.0664, 0.4823, 0.6003],
  [0.5461, 0.5273, 0.0149, 0.8321, 0.1671, 0.1288, 0.4524, 0.4653],
  [0.7977, 0.4390, 0.4012, 0.7984, 0.2276, 0.1892, 0.2161, 0.6387],
  [0.9350, 0.6748, 0.3791, 0.5700, 0.4686, 0.3958, 0.2963, 0.4924],
];

export const mockTimelapse: Timelapse = {
  dataset_info: {
    model_name: "MobileNetV2",
    schema_version: "1.0",
    n_components: 8,
  },
  frames: VECTORS.map((latent_vector, i) => ({
    frame_index: i,
    frame_id: `frame_${String(i).padStart(3, "0")}.png`,
    latent_vector,
  })),
};

export const mockHealth: Health = { status: "healthy" };

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
