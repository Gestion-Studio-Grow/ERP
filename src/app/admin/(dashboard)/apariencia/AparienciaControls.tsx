"use client";

// Controles de /admin/apariencia: selector de TEMA (claro/oscuro, por persona,
// localStorage — misma mecánica que el ThemeToggle de la topbar) y selector de
// COLOR DEL EQUIPO (por negocio, persistido en Tenant.accentPreset vía server
// action). El color se aplica AL INSTANTE (optimista, seteando las vars del
// contenedor del skin) y recién después viaja al server; si falla, se revierte.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyTheme, resolveTheme, setTheme, type Theme } from "../../theme-client";
import { updateAccentPresetAction } from "@/lib/apariencia-actions";

// ── Tema claro/oscuro ─────────────────────────────────────────────────────────

export function ThemeSelector() {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const t = resolveTheme();
    applyTheme(t);
    setThemeState(t);
    // Mantenerse en sincronía con el toggle de la topbar (y viceversa).
    const onChange = (e: Event) => setThemeState((e as CustomEvent<Theme>).detail);
    window.addEventListener("gsg-admin-theme-change", onChange);
    return () => window.removeEventListener("gsg-admin-theme-change", onChange);
  }, []);

  const elegir = (t: Theme) => {
    setTheme(t);
    setThemeState(t);
    window.dispatchEvent(new CustomEvent<Theme>("gsg-admin-theme-change", { detail: t }));
  };

  const opciones: { id: Theme; label: string; detalle: string }[] = [
    { id: "light", label: "Claro", detalle: "Fondo gris perla, ideal de día." },
    { id: "dark", label: "Oscuro", detalle: "Grafito profundo, descansa la vista." },
  ];

  return (
    <div role="group" aria-label="Tema del panel" className="grid grid-cols-1 gap-sm sm:grid-cols-2">
      {opciones.map((o) => {
        const activo = theme === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => elegir(o.id)}
            aria-pressed={activo}
            className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              activo
                ? "border-accent bg-accent-soft"
                : "border-line bg-surface-raised hover:bg-surface-sunken"
            }`}
          >
            <span className="flex items-center gap-2">
              {/* Miniatura del tema: canvas + card, con los hex REALES del mockup
                  (es una muestra del tema en sí, no UI temable — por eso los hex acá). */}
              <span
                aria-hidden
                className="grid h-9 w-12 shrink-0 place-items-center rounded-md border border-line"
                style={{ background: o.id === "dark" ? "#0d0d0f" : "#f5f5f7" }}
              >
                <span
                  className="block h-4 w-7 rounded-sm"
                  style={{
                    background: o.id === "dark" ? "#17171a" : "#ffffff",
                    boxShadow: "0 1px 2px rgba(0,0,0,.25)",
                  }}
                />
              </span>
              <span>
                <span className="block text-sm font-semibold text-strong">
                  {o.label}
                  {activo && <span className="ml-2 text-xs font-medium text-accent-ink">En uso</span>}
                </span>
                <span className="block text-xs text-muted">{o.detalle}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Color del equipo (acento persistido del tenant) ───────────────────────────

export type Swatch = {
  id: string;
  label: string;
  light: string;
  dark: string;
  onLight: string;
  onDark: string;
};

function aplicarAcento(s: Swatch) {
  document.querySelectorAll<HTMLElement>('[data-skin="fable"]').forEach((el) => {
    el.style.setProperty("--tenant-accent-light", s.light);
    el.style.setProperty("--tenant-on-accent-light", s.onLight);
    el.style.setProperty("--tenant-accent-dark", s.dark);
    el.style.setProperty("--tenant-on-accent-dark", s.onDark);
  });
}

export function AccentSelector({ swatches, actual }: { swatches: Swatch[]; actual: string }) {
  const router = useRouter();
  const [elegido, setElegido] = useState(actual);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const elegir = (s: Swatch) => {
    if (s.id === elegido) return;
    const previo = swatches.find((x) => x.id === elegido);
    setError(null);
    setElegido(s.id);
    aplicarAcento(s); // al instante, sin esperar el server
    startTransition(async () => {
      const r = await updateAccentPresetAction(s.id);
      if (!r.ok) {
        // Revertir la piel y el estado: el server es la verdad.
        if (previo) aplicarAcento(previo);
        setElegido(previo?.id ?? actual);
        setError(r.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div>
      <div role="group" aria-label="Color del equipo" className="flex flex-wrap gap-sm">
        {swatches.map((s) => {
          const activo = s.id === elegido;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => elegir(s)}
              disabled={pendiente && activo}
              aria-pressed={activo}
              aria-label={`Color ${s.label}`}
              title={s.label}
              className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                activo
                  ? "border-accent bg-accent-soft"
                  : "border-line bg-surface-raised hover:bg-surface-sunken"
              }`}
            >
              {/* Muestra doble: tono para tema claro (izq.) y para oscuro (der.).
                  Hex del PRESET en sí (dato, no UI temable). */}
              <span aria-hidden className="relative grid h-9 w-9 place-items-center">
                <span
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `linear-gradient(135deg, ${s.light} 50%, ${s.dark} 50%)`,
                  }}
                />
                {activo && (
                  <svg
                    viewBox="0 0 24 24"
                    className="relative h-4 w-4"
                    fill="none"
                    stroke={s.onLight}
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4.5 12.5l5 5 10-11" />
                  </svg>
                )}
              </span>
              <span className={`text-xs font-medium ${activo ? "text-strong" : "text-muted"}`}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
      <div aria-live="polite" className="mt-sm">
        {pendiente && <p className="text-xs text-muted">Guardando el color…</p>}
        {error && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
