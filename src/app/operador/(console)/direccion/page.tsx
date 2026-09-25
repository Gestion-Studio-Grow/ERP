import { ButtonLink } from "@/components/ui";
import { PANEL_PUBLICADO } from "./panel.generated";

export const dynamic = "force-dynamic";

// MESA DE DIRECCIÓN — vista ejecutiva de la cartera de negocios digitales de la Célula.
// Plano de plataforma (ADR-021/056): audiencia = dirección/dueños, no un tenant. El panel
// es HTML autocontenido servido por /operador/direccion/panel (protegido) y embebido acá.
export default function DireccionPage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-strong">Dirección</h1>
          <p className="text-muted text-sm mt-1">
            Los negocios propios del laboratorio, vistos de arriba: para decidir, no para operar.
            Publicado {PANEL_PUBLICADO}.
          </p>
        </div>
        <ButtonLink href="/operador/direccion/panel" target="_blank" rel="noreferrer">
          Abrir a pantalla completa ↗
        </ButtonLink>
      </div>
      <iframe
        title="Panel de Dirección — Célula de Negocios Digitales"
        src="/operador/direccion/panel"
        className="w-full rounded-xl border border-line bg-surface"
        style={{ height: "calc(100vh - 190px)" }}
      />
    </div>
  );
}
