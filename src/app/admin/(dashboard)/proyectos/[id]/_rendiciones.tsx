// Rendí: la pestaña «Rendiciones» del proyecto y la lista que comparte con «Mis rendiciones».
// Quien revisa (Dirección, Administración) ve todas; el resto, las suyas. Rinde quien está en el equipo del proyecto.

import { Badge, cn, type BadgeTone } from "@/components/ui";
import { fechaCorta } from "@/lib/proyectos/core";
import type { Actor } from "@/lib/proyectos/gestion.server";
import { anticiposDelProyecto, rendicionesDelProyecto, type AnticipoDelProyecto, type FilaRendicion } from "@/lib/proyectos/rendiciones.server";
import { ESTADO_RENDICION_LABEL, MEDIO_RENDICION_LABEL, SIN_MIGRACION } from "@/lib/proyectos/rendiciones-core";
import { formatearPesos } from "@/lib/rendiciones/dinero";
import type { EstadoRendicion } from "@/lib/rendiciones/tipos";
import { tarjeta } from "../_vista";
import { CerrarAnticipo, EntregarAnticipo, FormRendir, ReintegrarAhora, RevisarRendicion } from "./_rendiciones-cliente";

const TONO: Record<EstadoRendicion, BadgeTone> = { borrador: "neutral", enviada: "info", devuelta: "warning", rechazada: "danger", aprobada: "success", reintegrada: "success" };

const hoyEnArgentina = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());

export async function PestanaRendiciones({ a, proyectoId }: { a: Actor; proyectoId: string }) {
  const [r, anticipos] = await Promise.all([rendicionesDelProyecto(a, proyectoId), anticiposDelProyecto(a, proyectoId)]);
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
      {anticipos && <Anticipos proyectoId={proyectoId} {...anticipos} />}
    </div>
  );
}

/** Dirección/Administración: entregar un anticipo a alguien del equipo y cerrarlo con la cuadratura. */
function Anticipos({ proyectoId, anticipos, equipo }: { proyectoId: string; anticipos: readonly AnticipoDelProyecto[]; equipo: readonly { id: string; nombre: string }[] }) {
  return (
    <section className={cn(tarjeta, "lg:col-span-2")} aria-labelledby="titulo-anticipos">
      <h2 id="titulo-anticipos" className="font-semibold text-strong">Anticipos</h2>
      <p className="text-sm text-muted">Plata que se adelanta para gastos del evento. Sale de caja al entregarla; al cerrarlo, lo que sobra vuelve y lo que falta se reintegra.</p>
      {anticipos.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Todavía no se entregó ningún anticipo en este proyecto.</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {anticipos.map((x) => (
            <li key={x.id} className="grid gap-1 border-t border-line pt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="min-w-0 break-words font-medium text-strong">{x.persona}</p>
                <p className="tabular-nums font-semibold text-strong">{formatearPesos(x.montoCentavos)}</p>
              </div>
              <p className="text-sm text-muted">{`Entregado el ${fechaCorta(x.entregadoEl)}`}</p>
              <div><Badge tone={x.estado === "CERRADO" ? "neutral" : "info"}>{x.estado === "CERRADO" ? "Cerrado" : "Abierto"}</Badge></div>
              {x.estado === "CERRADO" ? (
                <p className="text-sm text-muted">{`Devolvió ${formatearPesos(x.devueltoCentavos)} · se le reintegró ${formatearPesos(x.reintegradoCentavos)}`}</p>
              ) : (
                <>
                  <p className="text-sm text-strong">{x.cierre}</p>
                  {x.sePuedeCerrar && <CerrarAnticipo id={x.id} />}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {equipo.length > 0 && <EntregarAnticipo proyectoId={proyectoId} equipo={equipo} />}
    </section>
  );
}

export function ListaRendiciones({ filas, conProyecto, vacio }: { filas: readonly FilaRendicion[]; conProyecto: boolean; vacio: string }) {
  if (filas.length === 0) return <p className="mt-3 text-sm text-muted">{vacio}</p>;
  return (
    <ul className="mt-3 grid gap-3">
      {filas.map((f) => (
        <li key={f.id} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 border-t border-line pt-3">
          {f.comprobante ? (
            // eslint-disable-next-line @next/next/no-img-element -- la foto sale de su ruta propia, con permiso
            <img src={f.comprobante} alt={`Comprobante de ${f.descripcion}`} width={64} height={64} loading="lazy" className="size-16 rounded-lg border border-line object-cover" />
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
            {f.comprobante && (
              <a href={f.comprobante} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-sm underline">Ver comprobante</a>
            )}
            {f.enLiquidacion && f.estado === "aprobada" && <p className="text-sm text-muted">Se reintegra con la liquidación del mes.</p>}
            {f.ultimoComentario && <p className="text-sm text-strong">«{f.ultimoComentario}»</p>}
            {f.puedeRevisar && <RevisarRendicion id={f.id} />}
            {f.puedeReintegrar && <ReintegrarAhora id={f.id} monto={formatearPesos(f.montoCentavos)} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
