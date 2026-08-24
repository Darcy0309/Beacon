"use client";

import { createContext, useContext, useEffect, useState } from "react";

const RoleContext = createContext(null);

export function RoleProvider({ children }) {
  const [role, setRoleState] = useState("admin");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("beacon-role");
      if (stored) setRoleState(stored);
    } catch {}
  }, []);

  const setRole = (r) => {
    setRoleState(r);
    try {
      localStorage.setItem("beacon-role", r);
    } catch {}
  };

  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext) ?? { role: "admin", setRole: () => {} };
}
