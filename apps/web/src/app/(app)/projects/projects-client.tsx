"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  Copy,
  FolderKanban,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type { Project } from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { aspectRatioLabel, formatDuration, formatUpdatedAt } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Scope = "active" | "archived";

export function ProjectsClient() {
  const [scope, setScope] = useState<Scope>("active");
  const [search, setSearch] = useState("");
  const [renaming, setRenaming] = useState<Project | null>(null);

  const projects = useQuery({
    queryKey: [...queryKeys.projects, "all"],
    queryFn: () => dataClient.projects.list({ includeArchived: true }),
  });

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (projects.data ?? [])
      .filter((project) => (scope === "archived" ? project.archivedAt !== null : project.archivedAt === null))
      .filter((project) => query === "" || project.title.toLowerCase().includes(query));
  }, [projects.data, scope, search]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={scope} onValueChange={(value) => setScope(value as Scope)}>
          <TabsList>
            <TabsTrigger value="active">Активные</TabsTrigger>
            <TabsTrigger value="archived">Архив</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative min-w-48 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по названию"
            className="pl-9"
            aria-label="Поиск проектов"
          />
        </div>

        <Button
          nativeButton={false} role="link" render={<Link href="/projects/new" />}
          className="bg-gradient-accent text-white hover:opacity-90"
        >
          <Plus className="size-4" />
          Новый проект
        </Button>
      </div>

      {projects.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : visible.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((project) => (
            <ProjectCard key={project.id} project={project} onRename={setRenaming} />
          ))}
        </div>
      ) : (
        <EmptyState scope={scope} hasSearch={search.trim().length > 0} />
      )}

      <RenameDialog project={renaming} onClose={() => setRenaming(null)} />
    </>
  );
}

function ProjectCard({
  project,
  onRename,
}: {
  project: Project;
  onRename: (project: Project) => void;
}) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.projects });

  const archive = useMutation({
    mutationFn: () => dataClient.projects.archive(project.id),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: () => dataClient.projects.restore(project.id),
    onSuccess: invalidate,
  });
  const duplicate = useMutation({
    mutationFn: () => dataClient.projects.duplicate(project.id),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => dataClient.projects.softDelete(project.id),
    onSuccess: invalidate,
  });

  const archived = project.archivedAt !== null;

  return (
    <Card className="shadow-soft transition-shadow hover:shadow-soft-lg">
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/projects/${project.id}`} className="min-w-0 flex-1">
            <p className="truncate font-medium">{project.title}</p>
            <p className="text-muted-foreground truncate text-xs">
              {project.description || "Без описания"}
            </p>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Действия">
                  <MoreVertical className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => onRename(project)}>
                <Pencil className="size-4" />
                Переименовать
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => duplicate.mutate()}>
                <Copy className="size-4" />
                Создать копию
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {archived ? (
                <DropdownMenuItem onClick={() => restore.mutate()}>
                  <ArchiveRestore className="size-4" />
                  Восстановить
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => archive.mutate()}>
                  <Archive className="size-4" />
                  Архивировать
                </DropdownMenuItem>
              )}
              <DropdownMenuItem variant="destructive" onClick={() => remove.mutate()}>
                <Trash2 className="size-4" />
                Удалить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span>{aspectRatioLabel(project.aspectRatio)}</span>
          <span>·</span>
          <span>
            {project.sceneCount} {pluralScenes(project.sceneCount)}
          </span>
          {project.durationSec > 0 ? (
            <>
              <span>·</span>
              <span className="tabular-nums">{formatDuration(project.durationSec)}</span>
            </>
          ) : null}
        </div>

        <p className="text-muted-foreground text-xs">
          Изменён {formatUpdatedAt(project.updatedAt)}
        </p>
      </CardContent>
    </Card>
  );
}

function pluralScenes(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "сцена";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "сцены";
  return "сцен";
}

function RenameDialog({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");

  const rename = useMutation({
    mutationFn: () => dataClient.projects.update(project!.id, { title: title.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      onClose();
    },
  });

  return (
    <Dialog
      open={project !== null}
      onOpenChange={(open) => {
        if (open && project) setTitle(project.title);
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Переименовать проект</DialogTitle>
        </DialogHeader>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="Название проекта"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            onClick={() => rename.mutate()}
            disabled={title.trim().length === 0 || rename.isPending}
          >
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ scope, hasSearch }: { scope: Scope; hasSearch: boolean }) {
  if (hasSearch) {
    return (
      <div className="border-border bg-card rounded-2xl border border-dashed p-10 text-center shadow-soft">
        <p className="text-muted-foreground text-sm">По этому запросу проектов не нашлось.</p>
      </div>
    );
  }

  if (scope === "archived") {
    return (
      <div className="border-border bg-card rounded-2xl border border-dashed p-10 text-center shadow-soft">
        <p className="text-muted-foreground text-sm">Архив пуст.</p>
      </div>
    );
  }

  return (
    <div className="border-border bg-card rounded-2xl border border-dashed p-10 text-center shadow-soft">
      <span className="bg-gradient-accent mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl">
        <FolderKanban className="size-5 text-white" />
      </span>
      <h2 className="font-semibold">Пока нет ни одного проекта</h2>
      <p className="text-muted-foreground mx-auto mt-1.5 max-w-md text-sm">
        Проект — это рабочее пространство: аватар, сцены с текстом, материалы и готовые версии
        видео.
      </p>
      <Button
        nativeButton={false} role="link" render={<Link href="/projects/new" />}
        className="bg-gradient-accent mt-5 text-white hover:opacity-90"
      >
        <Plus className="size-4" />
        Создать проект
      </Button>
    </div>
  );
}
