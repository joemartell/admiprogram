import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { LogLine } from "../lib/installer";

const STREAM_TONE: Record<LogLine["stream"], string> = {
  sistema: "text-info",
  stdout: "text-foreground/80",
  stderr: "text-danger",
};

const STREAM_TAG: Record<LogLine["stream"], string> = {
  sistema: "sis",
  stdout: "out",
  stderr: "err",
};

interface LogConsoleProps {
  lines: LogLine[];
  emptyText?: string;
  className?: string;
}

export function LogConsole({ lines, emptyText = "Sin actividad todavía.", className }: LogConsoleProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  return (
    <div
      className={cn(
        "overflow-y-auto rounded-lg border border-border bg-[#080909] p-3 font-mono text-[11px] leading-relaxed",
        className,
      )}
    >
      {lines.length === 0 ? (
        <p className="text-muted">{emptyText}</p>
      ) : (
        lines.map((line, index) => (
          <p key={`${line.at}-${index}`} className={cn("whitespace-pre-wrap break-all", STREAM_TONE[line.stream])}>
            <span className="mr-2 text-muted/60">
              {new Date(line.at).toLocaleTimeString("es-MX", { hour12: false })} {STREAM_TAG[line.stream]}
            </span>
            {line.text}
          </p>
        ))
      )}
      <div ref={endRef} />
    </div>
  );
}
