// T10 (GSG-MIA-171): la pestaña «Liquidación» del proyecto. Quien tiene permiso de liquidaciones ve todas las filas, las
// dos comparaciones de la revisión y el paso que le toca; el resto ve SÓLO su fila (el filtro es del servidor).

import { Badge, cn, type BadgeTone } from "@/components/ui";
import { fechaCorta } from "@/lib/proyectos/core";
import type { Actor } from "@/lib/proyectos/gestion.server";
import { panelDeLiquidacion, SIN_M5, type FilaVisible } from "@/lib/proyectos/liquidacion-proyecto.server";
import type { Comparacion } from "@/lib/proyectos/liquidacion-proyecto-core";
import { formatearPesos } from "@/lib/rendiciones/dinero";
import { tarjeta } from "../_vista";
import { AprobarLiquidacion, DeclararCostos, RevisarLiquidacion } from "./_liquidacion-cliente";

const ESTADO: Record<"BORRADOR" | "REVISADA" | "APROBADA", { label: string; tono: BadgeTone }> = {
  BORRADOR: { label: "Borrador", tono: "warning" },
  REVISADA: { label: "Revisada", tono: "info" },
  APROBADA: { label: "Aprobada", tono: "success" },
};

const FUNCION: Record<string, string> = { PRODUCTOR: "Producción", COMERCIAL: "Comercial", DISENO: "Diseño", EMPRESA: "Empresa" };

export async function PestanaLiquidacion({ a, proyectoId }: { a: Actor; proyectoId: string }) {
  const p = await panelDeLiquidacion(a, proyectoId);
  if (!p.m5 && p.veTodo) return <p className={cn(tarjeta, "text-sm text-muted")}>{SIN_M5}</p>;
  if (p.sinFoto) return <p className={cn(tarjeta, "text-sm text-muted")}>Todavía no hay liquidación: el proyecto necesita el precio aprobado con su equipo y su reparto.</p>;
  const estado = p.estado ? ESTADO[p.estado] : null;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <section className={tarjeta} aria-labelledby="titulo-liquidacion">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titulo-liquidacion" className="font-semibold text-strong">{p.veTodo ? "Liquidación del proyecto" : "Tu parte en este proyecto"}</h2>
          <Badge tone={estado?.tono ?? "neutral"}>{estado?.label ?? "Provisoria"}</Badge>
        </div>
        {p.provisoria && (
          <p className="mt-1 text-sm text-muted">
            {p.estado ? "Todavía no está aprobada: los importes pueden cambiar en la revisión." : "Provisoria: cambia mientras entren comprobantes y gastos. Queda fija cuando Dirección la aprueba."}
          </p>
        )}
        {p.estado === "APROBADA" && <p className="mt-1 text-sm text-muted">Congelada: lo que entre después va a ajuste, no cambia estos importes.</p>}
        {p.filas.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No participás en el reparto de este proyecto.</p>
        ) : (
          <Filas filas={p.filas} esperado={p.esperado} />
        )}
        {p.avisos.length > 0 && (
          <ul className="mt-3 grid gap-1 text-sm text-strong">
            {p.avisos.map((x) => <li key={x} className="rounded-lg border border-line bg-surface-raised px-3 py-2">{x}</li>)}
          </ul>
        )}
        {p.provisionales.length > 0 && (
          <p className="mt-3 text-xs text-muted">{`Valores provisionales a confirmar con el negocio: ${p.provisionales.map((x) => `«${x}»`).join(" y ")}.`}</p>
        )}
      </section>
      {p.veTodo && (
        <div className="grid content-start gap-4">
          {p.comparaciones.length > 0 && <Comparaciones lista={p.comparaciones} congelado={!!p.estado} />}
          <section className={tarjeta} aria-labelledby="titulo-paso">
            <h2 id="titulo-paso" className="font-semibold text-strong">{p.estado === "APROBADA" ? "Cómo se aprobó" : "Próximo paso"}</h2>
            {p.pasos.length > 0 && (
              <ol className="mt-2 grid gap-2 text-sm">
                {p.pasos.map((x) => (
                  <li key={x.que} className="border-t border-line pt-2">
                    <p className="text-strong">{x.que}</p>
                    <p className="text-muted">{`${x.quien} · ${fechaCorta(x.cuando)}`}</p>
                    {x.nota && <p className="text-strong">«{x.nota}»</p>}
                  </li>
                ))}
              </ol>
            )}
            {p.accion === "DECLARAR" && <DeclararCostos proyectoId={proyectoId} />}
            {p.accion === "REVISAR" && <RevisarLiquidacion proyectoId={proyectoId} conDiferencia={p.comparaciones.some((c) => c.diferencia !== 0)} />}
            {p.accion === "APROBAR" && <AprobarLiquidacion proyectoId={proyectoId} />}
            {p.motivo && <p className="mt-2 text-sm text-muted">{p.motivo}</p>}
          </section>
          {p.paraAjuste.length > 0 && (
            <section className={tarjeta} aria-labelledby="titulo-ajuste">
              <h2 id="titulo-ajuste" className="font-semibold text-strong">Entró después de aprobar</h2>
              <p className="text-sm text-muted">No cambia la liquidación aprobada: queda para un ajuste.</p>
              <ul className="mt-2 grid gap-1 text-sm">
                {p.paraAjuste.map((x) => (
                  <li key={x.id} className="flex flex-wrap justify-between gap-2 border-t border-line pt-2">
                    <span className="min-w-0 break-words text-strong">{x.origen}</span>
                    <span className="tabular-nums text-strong">{formatearPesos(x.costo)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Filas({ filas, esperado }: { filas: readonly FilaVisible[]; esperado: number | null }) {
  const col = "px-2 py-2 text-right tabular-nums";
  return (
    <>
      {/* Escritorio: tabla. Teléfono: una tarjeta por persona. */}
      <table className="mt-3 hidden w-full text-sm md:table">
        <caption className="sr-only">Reparto por persona, en pesos</caption>
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th scope="col" className="px-2 py-2 font-medium">Persona</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Comisión</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Reparto</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Redondeo</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Rentabilidad</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave} className="border-b border-line">
              <th scope="row" className="px-2 py-2 text-left font-medium text-strong">
                {f.nombre}
                <span className="block text-xs font-normal text-muted">{FUNCION[f.funcion] ?? f.funcion}</span>
              </th>
              <td className={col}>{formatearPesos(f.comision)}</td>
              <td className={cn(col, f.reparto < 0 && "text-danger")}>{formatearPesos(f.reparto)}</td>
              <td className={col}>{formatearPesos(f.redondeo)}</td>
              <td className={col}>{formatearPesos(f.rentabilidad)}</td>
              <td className={cn(col, "font-semibold text-strong", f.total < 0 && "text-danger")}>{formatearPesos(f.total)}</td>
            </tr>
          ))}
        </tbody>
        {esperado !== null && (
          <tfoot>
            <tr>
              <th scope="row" colSpan={5} className="px-2 py-2 text-right font-medium text-muted">Suma = Total venta − costo real</th>
              <td className={cn(col, "font-semibold text-strong")}>{formatearPesos(esperado)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      <ul className="mt-3 grid gap-3 md:hidden">
        {filas.map((f) => (
          <li key={f.clave} className="grid gap-1 border-t border-line pt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0 break-words font-medium text-strong">{f.nombre}</p>
              <p className={cn("tabular-nums font-semibold text-strong", f.total < 0 && "text-danger")}>{formatearPesos(f.total)}</p>
            </div>
            <p className="text-xs text-muted">{FUNCION[f.funcion] ?? f.funcion}</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {([["Comisión", f.comision], ["Reparto", f.reparto], ["Redondeo", f.redondeo], ["Rentabilidad", f.rentabilidad]] as const).filter(([, m]) => m !== 0).map(([t, m]) => (
                <div key={t} className="flex justify-between gap-2"><dt className="text-muted">{t}</dt><dd className="tabular-nums text-strong">{formatearPesos(m)}</dd></div>
              ))}
            </dl>
          </li>
        ))}
        {esperado !== null && (
          <li className="flex flex-wrap justify-between gap-2 border-t border-line pt-3 text-sm">
            <span className="text-muted">Suma = Total venta − costo real</span>
            <span className="tabular-nums font-semibold text-strong">{formatearPesos(esperado)}</span>
          </li>
        )}
      </ul>
    </>
  );
}

function Comparaciones({ lista, congelado }: { lista: readonly Comparacion[]; congelado: boolean }) {
  return (
    <section className={tarjeta} aria-labelledby="titulo-control">
      <h2 id="titulo-control" className="font-semibold text-strong">Control antes de aprobar</h2>
      {congelado && <p className="text-sm text-muted">El costo quedó congelado al declarar los costos completos.</p>}
      <div className="mt-2 grid gap-3">
        {lista.map((c) => (
          <div key={c.id} className={cn("grid gap-1 rounded-lg border px-3 py-2 text-sm", c.diferencia !== 0 ? "border-warning bg-warning-soft" : "border-line")}>
            <p className="font-medium text-strong">{c.titulo}</p>
            <div className="flex justify-between gap-2"><span className="text-muted">{c.izquierda.etiqueta}</span><span className="tabular-nums text-strong">{formatearPesos(c.izquierda.monto)}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted">{c.derecha.etiqueta}</span><span className="tabular-nums text-strong">{formatearPesos(c.derecha.monto)}</span></div>
            <div className="flex justify-between gap-2 border-t border-line pt-1">
              <span className="font-medium text-strong">{c.diferencia !== 0 ? "Diferencia" : "Sin diferencia"}</span>
              <span className="tabular-nums font-semibold text-strong">{formatearPesos(c.diferencia)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
