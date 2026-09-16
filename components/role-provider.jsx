"use client";

import { createContext, useContext } from "react";

const RoleContext = createContext(null);

/**
 * Carries the signed-in user's real role and profile down to client components
 * so the navigation can hide what the user has no access to. This is a
 * convenience only — Row Level Security in Postgres is what actually enforces
 * access.
 */
export function RoleProvider({ user, children }) {
  const value = {
    user: user ?? null,
    role: user?.role ?? "client",
  };
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext) ?? { user: null, role: "client" };
}
