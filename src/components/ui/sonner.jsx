"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

export function Toaster(props) {
  const { theme = "system" } = useTheme();
  return <Sonner theme={theme} richColors position="bottom-right" {...props} />;
}
