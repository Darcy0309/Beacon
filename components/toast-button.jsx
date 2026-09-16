"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function ToastButton({ children, message, type = "success", variant, size, className }) {
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={() => (typeof toast[type] === "function" ? toast[type](message) : toast(message))}
    >
      {children}
    </Button>
  );
}
