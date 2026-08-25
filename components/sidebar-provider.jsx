"use client";

import { createContext, useContext, useEffect, useState } from "react";

const SidebarContext = createContext(null);

export function SidebarProvider({ children }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("beacon-sidebar") === "1");
    } catch {}
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      const v = !c;
      try {
        localStorage.setItem("beacon-sidebar", v ? "1" : "0");
      } catch {}
      return v;
    });

  return <SidebarContext.Provider value={{ collapsed, toggle }}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  return useContext(SidebarContext) ?? { collapsed: false, toggle: () => {} };
}
