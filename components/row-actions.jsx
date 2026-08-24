"use client";

import Link from "next/link";
import { MoreHorizontal, Eye, Pencil, UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function RowActions({ name = "record", href }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel className="max-w-48 truncate">{name}</DropdownMenuLabel>
        {href ? (
          <DropdownMenuItem asChild>
            <Link href={href}><Eye /> Open</Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => toast(`Opening ${name}`)}><Eye /> Open</DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => toast.success(`Assigned ${name} to you`)}><UserPlus /> Assign to me</DropdownMenuItem>
        <DropdownMenuItem onClick={() => toast(`Editing ${name}`)}><Pencil /> Edit</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => toast.error(`Deleted ${name}`)}><Trash2 /> Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
