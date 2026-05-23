import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva("shadcn-button", {
  variants: {
    variant: {
      default: "shadcn-button-default",
      secondary: "shadcn-button-secondary",
      ghost: "shadcn-button-ghost",
      outline: "shadcn-button-outline",
      destructive: "shadcn-button-destructive",
    },
    size: {
      default: "shadcn-button-md",
      sm: "shadcn-button-sm",
      icon: "shadcn-button-icon",
      lg: "shadcn-button-lg",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";

export { buttonVariants };
