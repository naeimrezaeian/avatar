import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description ? (
          <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Явная заглушка для разделов, до которых очередь ещё не дошла. Показывает, что
 * раздел запланирован, а не сломан — пустой экран читается как баг.
 */
export function PagePlaceholder({
  title,
  description,
  planned,
}: {
  title: string;
  description: string;
  planned: string[];
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="border-border bg-card rounded-2xl border border-dashed p-6 shadow-soft">
        <p className="text-muted-foreground text-sm font-medium">
          Раздел в разработке. Запланировано:
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {planned.map((item) => (
            <li key={item} className="text-foreground/80 flex items-start gap-2 text-sm">
              <span className="bg-gradient-accent mt-1.5 size-1.5 shrink-0 rounded-full" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
