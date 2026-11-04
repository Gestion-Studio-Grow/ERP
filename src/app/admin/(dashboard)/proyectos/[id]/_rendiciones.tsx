// Rendí: la pestaña «Rendiciones» del proyecto y la lista que comparte con «Mis rendiciones».
// Quien revisa (Dirección, Administración) ve todas; el resto, las suyas. Rinde quien está en el equipo del proyecto.

import { Badge, cn, type BadgeTone } from "@/components/ui";
import { fechaCorta } from "@/lib/proyectos/core";
import type { Actor } from "@/lib/proyectos/gestion.server";
import { rendicionesDelProyecto, type FilaRendicion } from "@/lib/proyectos/rendiciones.server";
import { ESTADO_RENDICION_LABEL, MEDIO_RENDICION_LABEL, SIN_MIGRACION } from "@/lib/proyectos/rendiciones-core";
import { formatearPesos } from "@/lib/rendiciones/dinero";
import type { EstadoRendicion } from "@/lib/rendiciones/tipos";
import { tarjeta } from "../_vista";
import { FormRendir, RevisarRendicion } from "./_rendiciones-cliente";

const TONO: Record<EstadoRendicion, BadgeTone> = { borrador: "neutral", enviada: "info", devuelta: "warning", rechazada: "danger", aprobada: "success", reintegrada: "success" };

const hoyEnArgentina = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());

export async function PestanaRendiciones({ a, proyectoId }: { a: Actor; proyectoId: string }) {
  const r = await rendicionesDelProyecto(a, proyectoId);
  if (!r.disponible) return <p className={cn(tarjeta, "text-sm text-muted")}>{SIN_MIGRACION}</p>;
  const pendientes = r.filas.filter((f) => f.estado === "enviada");
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <section className={tarjeta} aria-labelledby="titulo-rendiciones">
        <h2 id="titulo-rendiciones" className="font-semibold text-strong">{r.revisa ? "Rendiciones del proyecto" : "Mis rendiciones en este proyecto"}</h2>
        {r.revisa && <p className="text-sm text-muted">{pendientes.length === 0 ? "No hay rendiciones para revisar." : `${pendientes.length} para revisar.`} Lo que rinde cada persona lo aprueba otra: nadie aprueba lo propio.</p>}
        <ListaRendiciones filas={r.filas} conProyecto={false} vacio="Todavía no hay rendiciones en este proyecto." />
      </section>
      {r.motivoNoRinde ? (
        <p className={cn(tarjeta, "self-start text-sm text-muted")}>{r.motivoNoRinde}</p>
      ) : (
        <section className={cn(tarjeta, "self-start")} aria-labelledby="titulo-rendir">
          <h2 id="titulo-rendir" className="mb-1 font-semibold text-strong">Rendir un gasto</h2>
          <p className="mb-3 text-sm text-muted">Sacale una foto al ticket o la factura, poné cuánto pagaste y mandalo. Administración lo revisa.</p>
          <FormRendir proyectoId={proyectoId} hoy={hoyEnArgentina()} anticipos={r.anticipos.map((x) => ({ id: x.id, montoCentavos: x.montoCentavos, entregado: fechaCorta(x.entregadoEl) }))} />
        </section>
      )}
    </div>
  );
}

export function ListaRendiciones({ filas, conProyecto, vacio }: { filas: readonly FilaRendicion[]; conProyecto: boolean; vacio: string }) {
  if (filas.length === 0) return <p className="mt-3 text-sm text-muted">{vacio}</p>;
  return (
    <ul className="mt-3 grid gap-3">
      {filas.map((f) => (
        <li key={f.id} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 border-t border-line pt-3">
          {f.foto ? (
            // eslint-disable-next-line @next/next/no-img-element -- la foto vive en la base como imagen achicada
            <img src={f.foto} alt={`Comprobante de ${f.descripcion}`} width={64} height={64} loading="lazy" className="size-16 rounded-lg border border-line object-cover" />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-lg border border-line text-xs text-muted">Sin foto</span>
          )}
          <div className="grid min-w-0 gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0 break-words font-medium text-strong">{f.descripcion}</p>
              <p className="tabular-nums font-semibold text-strong">{formatearPesos(f.montoCentavos)}</p>
            </div>
            <p className="text-sm text-muted">{[conProyecto ? f.proyecto : f.persona, fechaCorta(f.fecha), MEDIO_RENDICION_LABEL[f.medio]].join(" · ")}</p>
            <div><Badge tone={TONO[f.estado]}>{ESTADO_RENDICION_LABEL[f.estado]}</Badge></div>
            {f.foto && (
              <details className="text-sm">
                <summary className="inline-flex min-h-11 cursor-pointer items-center underline">Ver el comprobante</summary>
                {/* eslint-disable-next-line @next/next/no-img-element -- la foto vive en la base como imagen achicada */}
                <img src={f.foto} alt={`Comprobante de ${f.descripcion}, grande`} width={800} height={800} loading="lazy" className="mt-2 h-auto w-full max-w-md rounded-lg border border-line" />
              </details>
            )}
            {f.ultimoComentario && <p className="text-sm text-strong">«{f.ultimoComentario}»</p>}
            {f.puedeRevisar && <RevisarRendicion id={f.id} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
