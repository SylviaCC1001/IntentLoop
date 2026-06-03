import { Orbit } from "lucide-react";
import { cn } from "@/lib/utils";

type ProductLogoProps = {
  showWordmark?: boolean;
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
};

export default function ProductLogo({
  showWordmark = true,
  className,
  markClassName,
  wordmarkClassName,
}: ProductLogoProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm shadow-primary/20",
          markClassName
        )}
      >
        <Orbit size={18} strokeWidth={2.25} aria-hidden="true" />
      </div>
      {showWordmark ? (
        <span className={cn("truncate font-semibold", wordmarkClassName)}>
          IntentLoop
        </span>
      ) : null}
    </div>
  );
}
