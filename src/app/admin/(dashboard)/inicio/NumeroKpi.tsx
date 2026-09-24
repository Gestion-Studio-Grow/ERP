// El número de un tile. Componente de servidor ASÍNCRONO: cada uno va en su propio
// <Suspense>, así la grilla de apps se pinta al instante y cada número llega por su lado.
// Uno lento (o roto) no frena a los demás: `cargarKpi` tiene tope de 1,5 s y nunca tira.

import type { Role } from "@/lib/capabilities";
import { cargarKpi, type ResultadoKpi } from "@/apps/kpis/index.server";
import { NumeroEsqueleto } from "@/components/ui";

export default async function NumeroKpi({ appId, role }: { appId: string; role: Role }) {
  const resultado = await cargarKpi(appId, role);
  if (!resultado) return null;
  return <NumeroDelTile resultado={resultado} />;
}

/**
 * Mientras llega el número: el esqueleto compartido (src/components/ui/Esqueleto.tsx), del mismo
 * alto que el número, para que la grilla no salte. El "Calculando…" es para lectores de pantalla.
 */
export function NumeroCargando() {
  return (
    <span className="mt-auto block" aria-busy="true">
      <NumeroEsqueleto />
      <span className="sr-only">Calculando…</span>
    </span>
  );
}

export function NumeroDelTile({ resultado }: { resultado: ResultadoKpi }) {
  if (resultado.estado !== "ok") {
    // Sin número: '—' y el porqué. Nunca un 0: un 0 diría "no hay nada".
    return (
      <span className="mt-auto block border-t border-line pt-3">
        <span className="block text-2xl font-bold leading-tight text-faint" aria-hidden>
          —
        </span>
        <span className="mt-0.5 block text-[13px] text-muted">{resultado.motivo}</span>
      </span>
    );
  }
  const detalle = [resultado.detalle, resultado.monto].filter(Boolean).join(" · ");
  return (
    <span className="mt-auto block border-t border-line pt-3">
      <span className="block text-2xl font-bold leading-tight tracking-[-0.02em] tabular-nums text-strong">
        {resultado.valor}
      </span>
      {detalle && <span className="mt-0.5 block text-[13px] text-muted first-letter:uppercase">{detalle}</span>}
      {resultado.alerta && (
        <span className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-danger">
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3l9 16H3z" />
            <path d="M12 10v4M12 17h.01" />
          </svg>
          <span>
            {resultado.alerta.valor} {resultado.alerta.texto}
          </span>
        </span>
      )}
    </span>
  );
}
