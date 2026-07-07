import Link from "next/link";
import { isDemoSandbox } from "@/lib/demo-flag";
import { activeDemoRecommendation } from "@/lib/demo-consultor";

// Banda de honestidad del MODO DEMO. Solo se renderiza en el deploy de demo
// (DEMO_MODE_ENABLED=true); en un deploy de cliente REAL devuelve null y no
// aparece nada (su /admin con datos reales queda intacto). Cumple el ítem de
// honestidad del Gate (plan-acceso-sandbox-sin-password.md §6.4): el visitante
// ve, de forma clara y persistente, que está en un panel de demostración con
// datos ficticios que no se guardan. Usa tokens semánticos (`warning`), así
// respeta el tema/branding del backoffice del tenant demo.
export default function DemoBanner() {
  if (!isDemoSandbox()) return null;

  const rec = activeDemoRecommendation();
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 border-b border-warning bg-warning-soft px-4 py-2 text-center text-[13px] font-medium text-warning"
    >
      <span>
        Modo demo — {rec.blueprintLabel} · datos ficticios, nada se guarda.
      </span>
      <Link href="/probar" className="underline underline-offset-2">
        ¿Qué es esto?
      </Link>
    </div>
  );
}
