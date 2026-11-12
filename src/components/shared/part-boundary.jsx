"use client";

import { Component } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Told to the server (client_errors): what failed, and which component it failed in. */
function report(error, part, componentStack) {
  try {
    fetch("/api/client-errors", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: location.pathname + location.search,
        message: String(error?.message ?? error),
        stack: error?.stack ?? null,
        digest: error?.digest ?? null,
        component: `${part}${componentStack ?? ""}`,
      }),
    }).catch(() => {});
  } catch {
    // Never let the report break the fallback.
  }
}

/**
 * One part of a page that fails on its own (Sean, Nov 2026: the Call Result panel failing took the
 * whole lead sheet to "Something went wrong"). The rest of the page stays; this part says so, with
 * Try again to draw it afresh, and the failure is told to the server with the component it was in.
 *
 *   name   what the part is, for the report and the message ("Call Result")
 */
export default class PartBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(error);
    report(error, this.props.name ?? "part", info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Card data-part-error={this.props.name ?? ""} className="p-5 text-center text-sm">
        <AlertTriangle className="mx-auto size-5 text-amber-600" />
        <p className="mt-2 font-semibold">{this.props.name ? `${this.props.name} hit a snag` : "This part hit a snag"}</p>
        <p className="mt-1 text-muted-foreground">The rest of the page is fine. Try again to carry on.</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => this.setState({ error: null })}>
          <RotateCcw /> Try again
        </Button>
      </Card>
    );
  }
}
