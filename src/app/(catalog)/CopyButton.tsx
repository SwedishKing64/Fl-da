"use client";

import { useState } from "react";
import { Button } from "@/app/(catalog)/ui";

/**
 * Copy a handle, a SKU or a filename without selecting it by hand.
 *
 * Small, and it removes the one thing people actually do with these values. The label changes to
 * say it worked, because a button that does nothing visible has not told you anything.
 */
export function CopyButton({ value, label = "Copy", size = "sm" }: { value: string; label?: string; size?: "sm" | "md" }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size={size}
      variant="ghost"
      title={value}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "Copied" : label}
    </Button>
  );
}
