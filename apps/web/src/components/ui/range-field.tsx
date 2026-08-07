"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Ползунок с полем значения.
 *
 * Поле рядом с дорожкой не украшение: ползунком трудно попасть в точное число,
 * а скругление и приближение задают именно числами. Значение можно и тянуть, и
 * вписать, и обе стороны показывают одно и то же.
 */
export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  disabled,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  disabled?: boolean;
  hint?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const ratio = max === min ? 0 : (value - min) / (max - min);

  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>

      <div className="flex items-center gap-3">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(clamp(Number(event.target.value)))}
          // Заполненную часть дорожки рисуем градиентом: у поля ввода нет
          // отдельного элемента под неё, а два ползунка друг на друге ради
          // одной полоски — лишняя сложность.
          style={{
            background: `linear-gradient(to right, var(--foreground) 0%, var(--foreground) ${ratio * 100}%, var(--muted) ${ratio * 100}%, var(--muted) 100%)`,
          }}
          className={cn("range-field min-w-0 flex-1", disabled && "opacity-40")}
        />

        <div
          className={cn(
            "border-border bg-card focus-within:border-ring focus-within:ring-ring/20 flex shrink-0 items-baseline gap-1 rounded-xl border px-3 py-2 transition-all focus-within:ring-3",
            disabled && "opacity-40",
          )}
        >
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            aria-label={`${label}, значение`}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) onChange(clamp(next));
            }}
            className="w-10 min-w-0 border-0 bg-transparent p-0 text-right text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="text-muted-foreground text-xs">{unit}</span>
        </div>
      </div>

      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}
