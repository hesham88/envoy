/**
 * Browser-side Firebase AI Logic SDK bridge (served by Vite via `/@fs/` so Vite resolves
 * `firebase/ai` to the exact same singleton bundle used by `@envoy/ai`).
 */
import { getGenerativeModel, InferenceMode, InferenceSource } from 'firebase/ai';

export async function generateOnlyInCloud(
  fbAi,
  cloudModel,
  prompt,
  { json = false, temperature = 0.1, maxOutputTokens = 512 } = {},
) {
  const model = getGenerativeModel(fbAi, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: cloudModel,
      generationConfig: {
        temperature,
        maxOutputTokens,
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    },
  });
  const t0 = performance.now();
  try {
    const result = await model.generateContent(prompt);
    const ms = Math.round(performance.now() - t0);
    const text = result.response.text().trim();
    const inferenceSource =
      result.response.inferenceSource === InferenceSource.ON_DEVICE ? 'on_device' : 'in_cloud';
    return {
      ok: true,
      text,
      ms,
      model: cloudModel,
      inferenceSource,
      sdk: 'firebase/ai (ONLY_IN_CLOUD)',
    };
  } catch (err) {
    return {
      ok: false,
      ms: Math.round(performance.now() - t0),
      error: `${err?.name || 'Error'}: ${err?.message || String(err)}`,
    };
  }
}
