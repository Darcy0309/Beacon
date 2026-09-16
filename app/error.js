"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="max-w-md">
        <CardContent className="p-8 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-600">
            <AlertTriangle className="size-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Something went wrong</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            That screen could not be loaded. This is usually temporary — try again.
          </p>
          {error?.digest ? (
            <p className="mt-3 font-mono text-[0.7rem] text-muted-foreground">
              Reference: {error.digest}
            </p>
          ) : null}
          <Button onClick={reset} className="mt-5">
            <RotateCcw /> Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
