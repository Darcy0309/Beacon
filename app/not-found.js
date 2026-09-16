import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="max-w-md">
        <CardContent className="p-8 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Compass className="size-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Not found</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            That record does not exist, or you do not have access to it.
          </p>
          <Button asChild className="mt-5">
            <Link href="/">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
