import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"
import { triggerHaptic } from "@/lib/haptics"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-heading font-semibold tracking-tight transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-primary via-blue-600 to-primary text-primary-foreground shadow-[0_4px_16px_rgba(37,99,235,0.32),inset_0_1px_0_rgba(255,255,255,0.24)] hover:shadow-[0_6px_22px_rgba(37,99,235,0.42)] hover:brightness-105 active:brightness-95",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_4px_16px_rgba(239,68,68,0.25)] hover:bg-destructive/90 active:brightness-95",
        outline:
          "border border-slate-200/90 dark:border-white/[0.12] bg-card/70 dark:bg-card/50 backdrop-blur-md text-foreground shadow-xs hover:bg-primary/[0.08] hover:border-primary/50 hover:text-foreground active:brightness-95",
        secondary:
          "bg-secondary/90 text-secondary-foreground shadow-xs hover:bg-secondary active:brightness-95",
        ghost: "hover:bg-slate-100/90 dark:hover:bg-white/[0.08] text-foreground active:brightness-95",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-xl px-8 text-base",
        icon: "h-10 w-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, onClick, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"

  const handleClick = (e) => {
    if (!props.disabled) {
      triggerHaptic(variant === 'destructive' ? 'heavy' : 'light');
    }
    if (onClick) {
      onClick(e);
    }
  };

  return (
    (<Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      onClick={handleClick}
      {...props} />)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
