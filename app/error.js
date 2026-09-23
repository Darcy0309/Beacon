"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Most failures here are a slow first call to the database, which succeeds on
// a second try. Rather than leave the reader looking at an error and expecting
// them to navigate away and back, the screen reloads itself once. Module
// scope, so a boundary that remounts does not start the cycle again.
let lastAutoRetry = 0;
const RETRY_COOLDOWN_MS = 15_000;

export default function Error({ error, reset }) {
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    const now = Date.now();
    if (now - lastAutoRetry < RETRY_COOLDOWN_MS) return;
    lastAutoRetry = now;
    setRetrying(true);
    const timer = setTimeout(reset, 400);
    return () => clearTimeout(timer);
  }, [reset]);

  if (retrying) {
    return (
      <div className="flex flex-1 items-center justify-center p-6" aria-live="polite">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          Taking a moment longer than usual — reconnecting…
        </div>
      </div>
    );
  }

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
