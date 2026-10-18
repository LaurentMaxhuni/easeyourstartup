"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { CaretDown, CaretUp, Check } from "@phosphor-icons/react";
import { useRef, type AriaAttributes } from "react";
import { cn } from "@/lib/utils";

type SelectProps<T extends string> = Pick<AriaAttributes, "aria-label" | "aria-labelledby" | "aria-describedby"> & {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

export function Select<T extends string>({ value, onValueChange, options, id, name, disabled, required, className, ...aria }: SelectProps<T>) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Radix reserves the empty string. Encoding every value avoids sentinel collisions.
  const encode = (option: string) => `value:${option}`;

  return (
    <>
      {name || required ? (
        <select
          name={name}
          value={value}
          disabled={disabled}
          required={required}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(event) => onValueChange(event.target.value as T)}
          onInvalid={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}
        >
          {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
        </select>
      ) : null}
      <SelectPrimitive.Root value={encode(value)} onValueChange={(next) => onValueChange(next.slice(6) as T)} disabled={disabled}>
        <SelectPrimitive.Trigger
          ref={triggerRef}
          id={id}
          aria-required={required || undefined}
          className={cn("group flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-control border border-line bg-surface-raised px-3.5 py-2 text-left text-sm text-ink shadow-sm transition-[border-color,background-color,box-shadow] hover:border-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-accent [&>span:first-child]:min-w-0 [&>span:first-child]:truncate", className)}
          {...aria}
        >
          <SelectPrimitive.Value />
          <SelectPrimitive.Icon asChild><CaretDown aria-hidden="true" size={15} className="shrink-0 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180" /></SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content position="popper" sideOffset={6} collisionPadding={12} data-lenis-prevent
            className="ui-popover z-[100] max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-container border border-line bg-surface-raised p-1.5 text-ink shadow-[0_16px_48px_rgb(0_0_0_/_0.16)]">
            <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-muted"><CaretUp size={14} /></SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport data-lenis-prevent className="max-h-[var(--radix-select-content-available-height)] overscroll-contain">
              {options.map((option) => (
                <SelectPrimitive.Item key={option.value} value={encode(option.value)} disabled={option.disabled} textValue={option.label}
                  className="relative flex min-h-10 cursor-pointer items-center rounded-[7px] py-2 pl-3 pr-9 text-sm leading-5 outline-none transition-colors data-[highlighted]:bg-surface data-[state=checked]:bg-accent/10 data-[state=checked]:font-semibold data-[disabled]:pointer-events-none data-[disabled]:opacity-40">
                  <SelectPrimitive.ItemText><span className="block break-words">{option.label}</span></SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute right-3 text-accent"><Check aria-hidden="true" size={15} weight="bold" /></SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-muted"><CaretDown size={14} /></SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </>
  );
}
