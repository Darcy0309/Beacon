"use client";

export default function PageTransition({ children }) {
  return <div className="flex flex-1 flex-col animate-page-in">{children}</div>;
}
