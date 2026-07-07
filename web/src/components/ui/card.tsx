import * as React from "react";
import { cn } from "../../lib/utils";

function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[1.35rem] border border-white/10 bg-[rgba(40,42,54,0.72)] shadow-[0_20px_80px_rgba(0,0,0,0.28)] backdrop-blur-2xl",
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export { Card, CardContent };
