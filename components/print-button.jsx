"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrintButton({ children = "Print" }) {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <Printer /> {children}
    </Button>
  );
}
