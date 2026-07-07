import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium leading-none transition-colors",
  {
    variants: {
      variant: {
        default: "border-white/12 bg-white/8 text-[var(--foreground)] backdrop-blur-xl",
        cyan: "border-[rgba(139,233,253,0.28)] bg-[rgba(139,233,253,0.13)] text-[var(--dracula-cyan)]",
        green: "border-[rgba(80,250,123,0.25)] bg-[rgba(80,250,123,0.12)] text-[var(--dracula-green)]",
        pink: "border-[rgba(255,121,198,0.28)] bg-[rgba(255,121,198,0.13)] text-[var(--dracula-pink)]",
        orange: "border-[rgba(255,184,108,0.28)] bg-[rgba(255,184,108,0.13)] text-[var(--dracula-orange)]",
        purple: "border-[rgba(189,147,249,0.30)] bg-[rgba(189,147,249,0.14)] text-[var(--dracula-purple)]"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
