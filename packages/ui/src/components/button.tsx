import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-foreground text-background hover:bg-foreground/90",
        // Главный CTA экрана: в классике = default, в скине hop — лайм.
        // Кольцо фокуса в hop — непрозрачный foreground (ink): лайм/40 сливался
        // и с бумагой, и с самой кнопкой (контраст <3:1).
        brand: "bg-foreground text-background hover:bg-foreground/90 skin-hop:bg-primary skin-hop:text-primary-foreground skin-hop:hover:bg-primary/90 skin-hop:focus-visible:ring-foreground",
        outline: "border border-border bg-card hover:bg-accent",
        ghost: "hover:bg-accent",
        // Действие-акцент (пуск/подтверждение) и деструктив (стоп/аварийно).
        primary: "bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary/40",
        danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/40",
        dangerOutline: "border border-destructive-border bg-card text-destructive hover:bg-destructive-subtle"
      },
      // Размер задаёт паддинги/тач-таргет.
      size: {
        sm: "min-h-[36px] px-3 py-1.5 text-xs",
        md: "min-h-[44px] px-4 py-2 text-sm"
      }
    },
    defaultVariants: { variant: "default", size: "md" }
  }
);

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: Props) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
