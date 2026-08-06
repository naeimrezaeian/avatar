import type { ReactNode } from "react";

/**
 * Шаг формы с номером. Форма создания подкаста длинная, и без разбивки она
 * читается как сплошной список полей — непонятно, что обязательно, а что
 * настройка вывода. Номера дают порядок, заголовок — смысл группы.
 */
export function StepSection({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <span className="bg-gradient-accent flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white">
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          {hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}
        </div>
      </div>

      <div className="pl-0 sm:pl-10">{children}</div>
    </section>
  );
}
