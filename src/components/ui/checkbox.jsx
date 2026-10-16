import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { triggerHaptic } from "@/lib/haptics"

const Checkbox = React.forwardRef(({ className, onClick, onCheckedChange, ...props }, ref) => {
  const handleClick = (e) => {
    if (!props.disabled) {
      triggerHaptic('selection');
    }
    if (onClick) {
      onClick(e);
    }
  };

  const handleCheckedChange = (checked) => {
    if (!props.disabled) {
      triggerHaptic('selection');
    }
    if (onCheckedChange) {
      onCheckedChange(checked);
    }
  };

  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className
      )}
      onClick={handleClick}
      onCheckedChange={handleCheckedChange}
      {...props}>
      <CheckboxPrimitive.Indicator className={cn("flex items-center justify-center text-current")}>
        <Check className="h-4 w-4" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
})
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
