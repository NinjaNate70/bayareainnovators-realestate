"use client";
// Adapted shadcn/ui Sheet composition, using Radix Dialog for focus and dismissal.
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
export function Sheet({
  title,
  description,
  children,
  trigger,
  open,
  onOpenChange,
}: {
  title: string;
  description: string;
  children: ReactNode;
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open:boolean)=>void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-scrim" />
        <Dialog.Content className="sheet-panel">
          <div className="sheet-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close details">
              <X aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="sheet-body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
