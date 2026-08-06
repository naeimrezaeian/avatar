import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PodcastForm } from "../podcast-form";

export const metadata: Metadata = { title: "Новый подкаст" };

export default function NewPodcastPage() {
  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          nativeButton={false}
          role="link"
          render={<Link href="/podcast" />}
          aria-label="К списку подкастов"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Новый подкаст</h1>
      </div>
      <PodcastForm />
    </>
  );
}
