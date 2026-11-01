"use client";

// La tabla de la ficha del evento. Cada campo se guarda al salir de él; al guardar, el servidor regenera las cuotas y devuelve los
// totales nuevos. Lo que este rol no ve ni siquiera llega acá: si falta el dato, falta la columna.

import { useState, useTransition } from "react";
import { buttonClasses, cn } from "@/components/ui";
import { agregarItemFicha, borrarItemFicha, guardarCampoItem } from "@/lib/proyectos/acciones-ficha";
import { pesos, porRubro } from "@/lib/proyectos/core";
import { enMonedaDeVenta, ESTADOS_ITEM, ESTADO_ITEM_LABEL, MONEDAS, RUBROS, ventaEn } from "@/lib/proyectos/gestion-core";
import type { FilaFicha } from "@/lib/proyectos/ficha-core";
import { campo } from "../_vista";
import { AdjuntosItem } from "./_adjuntos-item";
import { FormAccion } from "./_cliente";

type Columnas = { costoUnit: boolean; costoTotal: boolean; recargo: boolean; margen: boolean };

const aTexto = (n: number | null | undefined): string => (n == null ? "" : String(n).replace(".", ","));

export function TablaFicha({
  proyectoId,
  presupuestoId,
  filas,
  proveedores,
  columnas,
  editable,
  editaCostos,
  recargoGeneral,
  moneda = "ARS",
  cambio = 1,
}: {
  proyectoId: string;
  presupuestoId: string | null;
  filas: FilaFicha[];
  proveedores: { id: string; name: string }[];
  columnas: Columnas;
  editable: boolean;
  editaCostos: boolean;
  recargoGeneral: number;
  moneda?: string;
  cambio?: number;
}) {
  // La venta se muestra y se escribe en la moneda del evento; costos y márgenes siguen en pesos.
  const venta = (n: number) => ventaEn(n, moneda, cambio);
  const simbolo = moneda === "USD" ? "US$" : "$";
  const [, iniciar] = useTransition();
  const [estado, setEstado] = useState<{ tipo: "guardando" | "guardado" | "error"; texto: string } | null>(null);
  const [armado, setArmado] = useState<string | null>(null);

  const guardar = (id: string, nombre: string, valor: string) => {
    setEstado({ tipo: "guardando", texto: "Guardando…" });
    iniciar(async () => {
      try {
        const r = await guardarCampoItem({ id, campo: nombre, valor });
        setEstado(r.ok ? { tipo: "guardado", texto: nombre === "costoReal" ? "Guardado." : "Guardado. Las cuotas quedaron al día." } : { tipo: "error", texto: r.error });
      } catch {
        setEstado({ tipo: "error", texto: "No se pudo guardar. Revisá la conexión y probá de nuevo." });
      }
    });
  };

  const borrar = (id: string) => {
    setArmado(null);
    setEstado({ tipo: "guardando", texto: "Borrando…" });
    iniciar(async () => {
      const r = await borrarItemFicha({ id });
      setEstado(r.ok ? { tipo: "guardado", texto: "Ítem quitado. Las cuotas quedaron al día." } : { tipo: "error", texto: r.error });
    });
  };

  const cantColumnas = 8 + Object.values(columnas).filter(Boolean).length + (columnas.costoUnit ? 1 : 0) + (editable ? 1 : 0);

  return (
    <div className="grid gap-3">
      {editable && presupuestoId && (
        <FormAccion accion={agregarItemFicha} limpiar className="grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)_auto]">
          <input type="hidden" name="presupuestoId" value={presupuestoId} />
          <select name="rubro" aria-label="Rubro del ítem nuevo" defaultValue={RUBROS[0]} className={campo}>
            {RUBROS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input name="descripcion" required maxLength={200} aria-label="Descripción del ítem nuevo" placeholder="Qué hay que contratar" className={campo} />
          <button type="submit" className={buttonClasses("solid", "md")}>Agregar ítem</button>
        </FormAccion>
      )}

      <p aria-live="polite" className={cn("min-h-5 text-sm", estado?.tipo === "error" ? "font-medium text-danger" : "text-muted")}>{estado?.texto}</p>

      {filas.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay ítems. Lo que cargues acá arma la planilla de venta, los cobros y los pagos.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1720px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 pr-2 font-medium">Descripción</th>
                <th className="pr-2 font-medium">Proveedor</th>
                <th className="pr-2 font-medium">Cant.</th>
                {columnas.costoUnit && <th className="pr-2 font-medium">Costo u.</th>}
                {columnas.costoUnit && <th className="pr-2 font-medium">Moneda</th>}
                {columnas.recargo && <th className="pr-2 font-medium">Recargo %</th>}
                {columnas.costoTotal && <th className="pr-2 text-right font-medium">Costo $</th>}
                {columnas.costoTotal && <th className="pr-2 font-medium">Costo real $</th>}
                <th className="pr-2 font-medium">Venta u. {simbolo}</th>
                <th className="pr-2 text-right font-medium">Venta {simbolo}</th>
                {columnas.margen && <th className="pr-2 text-right font-medium">Margen</th>}
                <th className="pr-2 font-medium">Fecha límite</th>
                <th className="pr-2 font-medium">Estado</th>
                <th className="pr-2 font-medium">Visible</th>
                <th className="pr-2 font-medium">Adjuntos</th>
                {editable && <th aria-label="Borrar" />}
              </tr>
            </thead>
            {porRubro(filas).map((g) => (
              <tbody key={g.rubro}>
                <tr>
                  <th colSpan={cantColumnas} className="pt-3 text-left">
                    <span className="sticky left-0 inline-flex flex-wrap items-baseline gap-2 bg-surface-raised pr-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-strong">{g.rubro}</span>
                      <span className="text-xs font-normal text-muted">Subtotal {venta(g.items.reduce((s, i) => s + i.venta, 0))}</span>
                    </span>
                  </th>
                </tr>
                {g.items.map((i) => (
                  <tr key={i.id} className="border-t border-line align-top">
                    {editable ? (
                      <>
                        <td className="py-1 pr-2 min-w-52">
                          <Entrada id={i.id} nombre="descripcion" valor={i.descripcion} etiqueta="Descripción" guardar={guardar} />
                          <select key={`rubro:${i.rubro}`} defaultValue={i.rubro} aria-label={`Rubro de ${i.descripcion}`} onChange={(e) => guardar(i.id, "rubro", e.target.value)} className={cn(campo, "mt-1 text-xs")}>
                            {!(RUBROS as readonly string[]).includes(i.rubro) && <option value={i.rubro}>{i.rubro}</option>}
                            {RUBROS.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </td>
                        <td className="py-1 pr-2 min-w-44">
                          <select key={`prov:${i.supplierId}`} defaultValue={i.supplierId ?? ""} aria-label={`Proveedor de ${i.descripcion}`} onChange={(e) => guardar(i.id, "supplierId", e.target.value)} className={campo}>
                            <option value="">{!i.supplierId && i.proveedorTexto ? `${i.proveedorTexto} (sin vincular)` : "Sin proveedor"}</option>
                            {i.supplierId && !proveedores.some((p) => p.id === i.supplierId) && <option value={i.supplierId}>{i.proveedorTexto}</option>}
                            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </td>
                        <td className="py-1 pr-2 min-w-24"><Entrada id={i.id} nombre="cantidad" valor={aTexto(i.cantidad)} etiqueta="Cantidad" guardar={guardar} numero /></td>
                        {columnas.costoUnit && <td className="py-1 pr-2 min-w-36"><Entrada id={i.id} nombre="costo" valor={aTexto(i.costo)} etiqueta="Costo unitario" guardar={guardar} numero bloqueado={!editaCostos} /></td>}
                        {columnas.costoUnit && (
                          <td className="py-1 pr-2 min-w-24">
                            <select key={`mon:${i.moneda}`} defaultValue={i.moneda} disabled={!editaCostos} aria-label={`Moneda de ${i.descripcion}`} onChange={(e) => guardar(i.id, "moneda", e.target.value)} className={campo}>
                              {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </td>
                        )}
                        {columnas.recargo && (
                          <td className="py-1 pr-2 min-w-24">
                            <Entrada id={i.id} nombre="recargoPct" valor={aTexto(i.recargoPct)} etiqueta="Recargo" guardar={guardar} numero bloqueado={!editaCostos} ayuda={i.precioManual > 0 && i.recargoPct == null ? "a mano" : `${recargoGeneral}`} />
                          </td>
                        )}
                        {columnas.costoTotal && <td className="py-1 pr-2 pt-3 text-right tabular-nums">{pesos(i.costoTotal ?? 0)}</td>}
                        {columnas.costoTotal && (
                          <td className="py-1 pr-2 min-w-36">
                            <Entrada id={i.id} nombre="costoReal" valor={i.costoReal == null ? "" : aTexto(i.costoReal)} etiqueta="Costo real" guardar={guardar} numero bloqueado={!editaCostos} />
                          </td>
                        )}
                        <td className="py-1 pr-2 min-w-36">
                          <Entrada id={i.id} nombre="precio" valor={i.precioManual > 0 ? aTexto(enMonedaDeVenta(i.precioManual, cambio)) : ""} etiqueta="Precio de venta unitario" guardar={guardar} numero bloqueado={!editaCostos} ayuda={aTexto(enMonedaDeVenta(i.ventaUnitaria, cambio))} />
                        </td>
                        <td className="py-1 pr-2 pt-3 text-right font-medium text-strong tabular-nums">{venta(i.venta)}</td>
                        {columnas.margen && <td className={cn("py-1 pr-2 pt-3 text-right tabular-nums", (i.margen ?? 0) < 0 && "text-danger")}>{pesos(i.margen ?? 0)}</td>}
                        <td className="py-1 pr-2 min-w-40"><Entrada id={i.id} nombre="fechaLimite" valor={i.fechaLimite} etiqueta="Fecha límite" guardar={guardar} tipo="date" /></td>
                        <td className="py-1 pr-2 min-w-36">
                          <select key={`est:${i.estadoItem}`} defaultValue={i.estadoItem} aria-label={`Estado de ${i.descripcion}`} onChange={(e) => guardar(i.id, "estadoItem", e.target.value)} className={campo}>
                            {ESTADOS_ITEM.map((s) => <option key={s} value={s}>{ESTADO_ITEM_LABEL[s]}</option>)}
                          </select>
                        </td>
                        <td className="py-1 pr-2">
                          <label className="flex min-h-11 items-center justify-center">
                            <input type="checkbox" key={`vis:${i.visibleCliente}`} defaultChecked={i.visibleCliente} aria-label={`${i.descripcion} visible al cliente`} className="size-5" onChange={(e) => guardar(i.id, "visibleCliente", e.target.checked ? "1" : "0")} />
                          </label>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-2">{i.descripcion}</td>
                        <td className="py-2 pr-2">{i.proveedorTexto ?? "—"}</td>
                        <td className="py-2 pr-2 tabular-nums">{i.cantidad.toLocaleString("es-AR")}</td>
                        {columnas.costoUnit && <td className="py-2 pr-2 tabular-nums">{(i.costo ?? 0).toLocaleString("es-AR")}</td>}
                        {columnas.costoUnit && <td className="py-2 pr-2">{i.moneda}</td>}
                        {columnas.recargo && <td className="py-2 pr-2 tabular-nums">{i.recargoPct ?? "—"}</td>}
                        {columnas.costoTotal && <td className="py-2 pr-2 text-right tabular-nums">{pesos(i.costoTotal ?? 0)}</td>}
                        {columnas.costoTotal && (
                          <td className="py-1 pr-2 min-w-36">
                            <Entrada id={i.id} nombre="costoReal" valor={i.costoReal == null ? "" : aTexto(i.costoReal)} etiqueta="Costo real" guardar={guardar} numero bloqueado={!editaCostos} />
                          </td>
                        )}
                        <td className="py-2 pr-2 tabular-nums">{venta(i.ventaUnitaria)}</td>
                        <td className="py-2 pr-2 text-right font-medium text-strong tabular-nums">{venta(i.venta)}</td>
                        {columnas.margen && <td className={cn("py-2 pr-2 text-right tabular-nums", (i.margen ?? 0) < 0 && "text-danger")}>{pesos(i.margen ?? 0)}</td>}
                        <td className="py-2 pr-2">{i.fechaLimite || "—"}</td>
                        <td className="py-2 pr-2">{ESTADO_ITEM_LABEL[i.estadoItem] ?? i.estadoItem}</td>
                        <td className="py-2 pr-2">{i.visibleCliente ? "Sí" : "No"}</td>
                      </>
                    )}
                    <td className="py-1 pr-2">
                      {editable ? (
                        <AdjuntosItem proyectoId={proyectoId} itemId={i.id} descripcion={i.descripcion} cantidad={i.adjuntos} />
                      ) : (
                        <a href={`/admin/proyectos/${proyectoId}?tab=archivos`} className="flex min-h-11 items-center justify-center underline tabular-nums" aria-label={`Adjuntos de ${i.descripcion}: ${i.adjuntos}`}>{i.adjuntos}</a>
                      )}
                    </td>
                    {editable && (
                      <td className="py-1 text-right">
                        {armado === i.id ? (
                          <span className="flex gap-1">
                            <button type="button" className={buttonClasses("danger", "md")} onClick={() => borrar(i.id)}>Borrar</button>
                            <button type="button" className={buttonClasses("ghost", "md")} onClick={() => setArmado(null)}>No</button>
                          </span>
                        ) : (
                          <button type="button" className={buttonClasses("ghost", "md")} aria-label={`Borrar ${i.descripcion}`} onClick={() => setArmado(i.id)}>Borrar</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}

function Entrada({ id, nombre, valor, etiqueta, guardar, numero, tipo, bloqueado, ayuda }: { id: string; nombre: string; valor: string; etiqueta: string; guardar: (id: string, nombre: string, valor: string) => void; numero?: boolean; tipo?: string; bloqueado?: boolean; ayuda?: string }) {
  return (
    <input
      key={`${nombre}:${valor}`}
      type={tipo ?? "text"}
      defaultValue={valor}
      disabled={bloqueado}
      aria-label={etiqueta}
      placeholder={ayuda}
      inputMode={numero ? "decimal" : undefined}
      className={campo}
      onBlur={(e) => {
        if (e.target.value.trim() !== valor) guardar(id, nombre, e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
