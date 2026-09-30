"use client";

import { createContext, useContext } from "react";

const RoleContext = createContext(null);

/**
 * Carries the signed-in user's real role down to client components so the
 * navigation can hide what they have no access to. This is convenience only —
 * Row Level Security in Postgres is what actually enforces access.
 */
export function RoleProvider({ user, children }) {
  return (
    <RoleContext.Provider value={{ user: user ?? null, role: user?.role ?? "client" }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext) ?? { user: null, role: "client" };
}
