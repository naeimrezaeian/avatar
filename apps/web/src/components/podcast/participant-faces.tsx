"use client";

import { UserRound } from "lucide-react";
import { primaryImage, type Avatar } from "@avatar/contracts";
import { useAssetUrl } from "@/lib/data/use-asset-url";
import { cn } from "@/lib/utils";

/**
 * Лица участников подкаста. Вынесено в отдельный компонент, потому что нужно и
 * в карточке списка, и в шапке выпуска, и в форме создания — а ссылки на
 * локальные файлы каждый раз запрашиваются заново и должны отзываться.
 */
export function ParticipantFaces({
  avatars,
  size = "md",
  className,
}: {
  avatars: Array<Avatar | null>;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dimension = size === "lg" ? "size-20" : size === "sm" ? "size-10" : "size-14";
  const overlap = size === "lg" ? "-ml-5" : size === "sm" ? "-ml-3" : "-ml-4";

  return (
    <div className={cn("flex", className)}>
      {avatars.map((avatar, index) => (
        <Face
          key={avatar?.id ?? index}
          avatar={avatar}
          className={cn(dimension, index > 0 && overlap)}
        />
      ))}
    </div>
  );
}

function Face({ avatar, className }: { avatar: Avatar | null; className?: string }) {
  const url = useAssetUrl(avatar ? primaryImage(avatar)?.assetId : null);

  return (
    <span
      className={cn(
        "bg-muted ring-card flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-3",
        className,
      )}
      title={avatar?.name}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- локальный object URL, оптимизатор next/image к нему не применим
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <UserRound className="text-muted-foreground size-1/2" />
      )}
    </span>
  );
}
