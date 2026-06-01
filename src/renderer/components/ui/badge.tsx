import type * as React from "react";
import { cn } from "../../lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("inline-flex items-center rounded-md bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground", className)}
      {...props}
    />
  );
}
