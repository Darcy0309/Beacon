"use client";

import { useState } from "react";
import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import AppearanceDialog from "@/components/layout/appearance-dialog";

/** Light, dark or the computer's own; and Appearance: a wallpaper and each theme's brightness. */
export default function ThemeToggle() {
  const { setTheme } = useTheme();
  const [appearance, setAppearance] = useState(false);
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="relative" aria-label="Toggle theme">
            <Sun className="size-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setTheme("light")}><Sun /> Light</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}><Moon /> Dark</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")}><Monitor /> System</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setAppearance(true)} data-open-appearance><Palette /> Appearance…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AppearanceDialog open={appearance} onOpenChange={setAppearance} />
    </>
  );
}
