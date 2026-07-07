"use client";

// Refresco automático del cockpit (spec T4 §2: near-real-time por POLL, sin
// websockets). Cada `seconds` pide un re-render del server component (router.refresh)
// → los widgets se actualizan solos. Es la cadencia suave que el plan free tolera.
// Pausa el poll si la pestaña está oculta (no gasta cuando nadie mira).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [activo, setActivo] = useState(true);

  useEffect(() => {
    const onVis = () => setActivo(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!activo) return;
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [activo, seconds, router]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${activo ? "bg-emerald-500 cockpit-pulse" : "bg-muted"}`} />
      {activo ? `al día · cada ${seconds}s` : "en pausa"}
    </span>
  );
}
