import { z } from "zod";

/**
 * Contrato de datos del backend (schema_version "1.0").
 * Se valida en tiempo de ejecución porque el endpoint actual es temporal
 * y su forma puede cambiar: así un cambio se detecta con un error claro.
 */

export const healthSchema = z.object({
  status: z.string(),
});

export const frameSchema = z.object({
  /** Posición del frame en el timelapse (0, 1, 2…). */
  frame_index: z.number().int().nonnegative(),
  /** Nombre del archivo de origen, p. ej. "frame_000.png". */
  frame_id: z.string(),
  /** 8 valores en [0, 1] extraídos por MobileNetV2 + PCA. */
  latent_vector: z.array(z.number()),
});

export const datasetInfoSchema = z.object({
  model_name: z.string(),
  schema_version: z.string(),
  n_components: z.number().int(),
});

export const timelapseSchema = z.object({
  dataset_info: datasetInfoSchema,
  frames: z.array(frameSchema),
});

export type Health = z.infer<typeof healthSchema>;
export type Frame = z.infer<typeof frameSchema>;
export type DatasetInfo = z.infer<typeof datasetInfoSchema>;
export type Timelapse = z.infer<typeof timelapseSchema>;
