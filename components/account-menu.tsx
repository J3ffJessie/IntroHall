"use client";

import { List, SignOut, SquaresFour, UserCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Compact navigation for narrow screens; wider screens show the links inline. */
export function AccountMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Menu"
                           className="grid size-9 place-items-center rounded-xl border border-border-strong bg-surface text-fg hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary sm:hidden">
        <List className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link href="/dashboard"><SquaresFour weight="duotone" />Dashboard</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/profile"><UserCircle weight="duotone" />Profile</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action="/auth/signout" method="post">
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full"><SignOut weight="duotone" />Sign out</button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
