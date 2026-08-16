import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold transition-[transform,background-color,color,border-color] duration-200 hover:-translate-y-px disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
  {
    variants: {
      variant: {
        primary:
          "border border-accent bg-accent text-accent-ink hover:brightness-95",
        secondary:
          "border border-line bg-surface-raised text-ink hover:bg-surface",
        ghost: "border border-transparent text-ink hover:bg-surface",
        danger:
          "border border-danger bg-danger text-[#f4f3ef] hover:brightness-95",
      },
      size: {
        sm: "min-h-9 px-3 text-xs",
        md: "min-h-10 px-4",
        lg: "min-h-12 px-5 text-base",
        icon: "size-10 px-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { buttonVariants };
