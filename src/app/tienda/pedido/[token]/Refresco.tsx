"use client";

// Vuelve a pedir la página cada 30 s mientras el pedido no terminó (y sólo con la pestaña a la vista).
import { useEffect } from "react";
import { useRouter } from "next/navigation";

const CADA_MS = 30_000;

export default function Refresco({ activo }: { activo: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!activo) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, CADA_MS);
    return () => clearInterval(t);
  }, [activo, router]);
  return null;
}
