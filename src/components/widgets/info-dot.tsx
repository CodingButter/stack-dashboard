"use client";

import { Info } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { GLOSSARY, type GlossaryTerm } from "@/lib/glossary";
import { cn } from "@/lib/utils";

type InfoDotProps = {
  /** A glossary key — pulls the title + body from the shared glossary. */
  term?: GlossaryTerm;
  /** Or provide the copy inline (overrides the glossary lookup). */
  title?: string;
  body?: string;
  className?: string;
};

/**
 * A small "i" info circle. Click it to reveal a plain-English explanation of
 * the metric, widget, or panel it sits beside. Works on touch and desktop.
 */
export function InfoDot({ term, title, body, className }: InfoDotProps) {
  const entry = term ? GLOSSARY[term] : undefined;
  const heading = title ?? entry?.title;
  const text = body ?? entry?.body;

  if (!text) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={heading ? `What is ${heading}?` : "More information"}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        onClick={(e) => e.stopPropagation()}
        className="space-y-1"
      >
        {heading ? (
          <p className="text-sm font-semibold text-foreground">{heading}</p>
        ) : null}
        <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
      </PopoverContent>
    </Popover>
  );
}
