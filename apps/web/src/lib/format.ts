/** Длительность в виде м:сс — так её читают в видеоредакторах. */
export function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
}

const RELATIVE = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });
const ABSOLUTE = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long" });

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
];

/**
 * «5 минут назад» для свежего и обычная дата для старого. Относительное время
 * старше недели перестаёт помогать: «3 недели назад» ничего не говорит о том,
 * какой из проектов правился раньше.
 */
export function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  let delta = (date.getTime() - Date.now()) / 1000;

  for (const [unit, size] of UNITS) {
    if (Math.abs(delta) < size) return RELATIVE.format(Math.round(delta), unit);
    delta /= size;
  }

  return ABSOLUTE.format(date);
}

const ASPECT_LABELS: Record<string, string> = {
  "16:9": "Горизонтальное",
  "9:16": "Вертикальное",
  "1:1": "Квадратное",
};

export function aspectRatioLabel(value: string): string {
  return ASPECT_LABELS[value] ?? value;
}
