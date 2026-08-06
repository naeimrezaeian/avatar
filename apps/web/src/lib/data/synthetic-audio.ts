/**
 * Синтетическая «озвучка» для первого этапа.
 *
 * Настоящего синтеза речи ещё нет, но без реального аудиофайла нечего рисовать
 * на дорожке, нечего обрезать и нечем проверять синхронизацию в превью. Поэтому
 * задача TTS отдаёт корректный WAV нужной длительности с речеподобной
 * огибающей — это не речь, а именно заглушка, и её слышно как таковую.
 */

const SAMPLE_RATE = 8000;

function writeString(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

/** Слоги: чередование звонких участков и пауз, примерно как в речи. */
function envelopeAt(seconds: number): number {
  const syllable = Math.sin(seconds * Math.PI * 2 * 3.4);
  const phrase = Math.sin(seconds * Math.PI * 2 * 0.23);
  const gate = Math.max(0, syllable) * (0.55 + 0.45 * Math.max(0, phrase));
  return gate;
}

export function createSyntheticSpeechWav(durationSec: number): Blob {
  const frames = Math.max(1, Math.round(durationSec * SAMPLE_RATE));
  const dataBytes = frames * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // моно
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  for (let frame = 0; frame < frames; frame += 1) {
    const seconds = frame / SAMPLE_RATE;
    // Основной тон плавает — ровный синус звучал бы как сигнал будильника и
    // давал бы неотличимую от прямоугольника огибающую.
    const pitch = 130 + 22 * Math.sin(seconds * Math.PI * 2 * 0.7);
    const tone =
      Math.sin(seconds * Math.PI * 2 * pitch) * 0.6 +
      Math.sin(seconds * Math.PI * 2 * pitch * 2) * 0.25;

    const amplitude = envelopeAt(seconds) * 0.35;
    view.setInt16(44 + frame * 2, Math.round(tone * amplitude * 32767), true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/** Пики для дорожки считаются из той же огибающей, без повторного декодирования. */
export function syntheticPeaks(durationSec: number, buckets = 400): number[] {
  const peaks: number[] = [];
  for (let index = 0; index < buckets; index += 1) {
    const seconds = (index / buckets) * durationSec;
    peaks.push(Math.round(Math.min(1, envelopeAt(seconds)) * 1000) / 1000);
  }
  return peaks;
}
