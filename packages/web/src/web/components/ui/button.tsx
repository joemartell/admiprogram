import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium tracking-tight transition-all duration-150 disabled:pointer-events-none disabled:opacity-45 outline-none shrink-0 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus-visible:ring-2 focus-visible:ring-accent/60",
  {
    variants: {
      variant: {
        default: "bg-accent text-[#14100a] hover:brightness-110 active:brightness-95 font-semibold",
        outline: "border border-border bg-surface-2/60 text-foreground hover:border-accent/60 hover:bg-surface-2",
        ghost: "text-muted hover:bg-surface-2 hover:text-foreground",
        danger: "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
        quiet: "border border-border bg-transparent text-muted hover:text-foreground hover:border-muted/50",
      },
      size: {
        default: "h-9 px-4 text-sm",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-11 px-6 text-[15px]",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
