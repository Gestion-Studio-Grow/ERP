import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSandbox } from "@/lib/demo-flag";
import { activeDemoRecommendation } from "@/lib/demo-consultor";

// ─────────────────────────────────────────────────────────────────────────────
// PUNTO DE ENTRADA VISIBLE al backoffice en MODO DEMO (sin password).
//
// Gateado por entorno: SOLO existe en el deploy de demo (DEMO_MODE_ENABLED=true).
// En un deploy de cliente REAL (Magra/CH/etc.) esta ruta responde 404 — nunca
// expone el `/admin` real del cliente ni su login. El acceso sin password y los
// datos ficticios ya existen (docs/preventa/plan-acceso-sandbox-sin-password.md);
// esto es la puerta VISIBLE que faltaba, que además muestra lo que el CONSULTOR
// recomendó para el rubro antes de entrar (consultor → backoffice).
// ─────────────────────────────────────────────────────────────────────────────

// Depende del entorno (no se pre-renderiza a una versión fija): el gate y la
// recomendación se resuelven por request en el deploy de demo.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Probá el panel — Demo | Gestión Studio Grow",
  description: "Entrá al backoffice del ERP en modo demo: datos ficticios de tu rubro, sin contraseña.",
  robots: { index: false, follow: false },
};

// Etiquetas legibles para los ids de módulo de la recomendación.
const MODULE_LABELS: Record<string, string> = {
  agenda: "Agenda de turnos",
  pos: "Punto de venta",
  catalog: "Catálogo",
  clients: "Clientes",
  waitlist: "Lista de espera",
  reminders: "Recordatorios",
  reports: "Reportes",
  arca: "Facturación ARCA",
  inventario: "Inventario",
  caja: "Caja",
};

export default function ProbarPage() {
  // Fuera del deploy de demo, la puerta no existe (no revela nada del cliente real).
  if (!isDemoSandbox()) notFound();

  const rec = activeDemoRecommendation();
  // Aterriza en la pantalla primaria del rubro: agenda para servicios, mostrador
  // (caja/POS) para retail/gastronomía.
  const target = rec.primaryScreen === "agenda" ? "/admin/turnos" : "/admin/caja";

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
        Modo demo
      </span>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-neutral-900">Probá el panel de gestión</h1>
        <p className="text-[15px] leading-relaxed text-neutral-600">
          Entrá al backoffice real del ERP con un negocio de ejemplo de tu rubro.
          <br />
          <strong>Sin contraseña</strong> y con <strong>datos ficticios</strong>: nada se guarda ni se toca nada real.
        </p>
      </div>

      {/* Lo que el consultor recomendó para este rubro (consultor → backoffice). */}
      <div className="w-full rounded-2xl border border-neutral-200 bg-white p-5 text-left shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Preparado para</p>
        <p className="mt-1 text-lg font-semibold text-neutral-900">{rec.blueprintLabel}</p>
        <p className="text-sm text-neutral-500">Familia {rec.familyLabel}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {rec.modules.map((m) => (
            <span
              key={m}
              className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700"
            >
              {MODULE_LABELS[m] ?? m}
            </span>
          ))}
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-neutral-500">
          Así queda armado tu sistema. En la demo recorrés el <strong>panel del dueño, la
          {rec.primaryScreen === "agenda" ? " agenda" : " caja"}, tus clientes y los reportes</strong> con
          datos de ejemplo. El resto de los módulos se enciende cuando activás tu negocio.
        </p>
      </div>

      <div className="w-full space-y-3">
        <Link
          href={target}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-6 py-3.5 text-[15px] font-semibold text-white shadow-lg transition-transform active:translate-y-px"
        >
          Ver el backoffice (demo)
          <span aria-hidden>→</span>
        </Link>
        <Link
          href="/admin"
          className="block text-[13px] text-neutral-500 underline-offset-2 hover:underline"
        >
          o entrá directo al Panel del Dueño
        </Link>
      </div>
    </main>
  );
}
