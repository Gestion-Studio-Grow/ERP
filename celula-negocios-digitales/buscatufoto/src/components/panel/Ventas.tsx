"use client";

import { useState } from "react";
import { Selector, Vacio } from "@/components/ui";
import { fechaHora, plata } from "@/lib/dinero";
import { useDatos } from "@/lib/hooks";
import { obtenerRepo } from "@/lib/repo";
import type { Album, Pedido } from "@/lib/tipos";
import { Cargando, Cifra, Encabezado, ErrorCarga, Seccion, useAlbumes, useFotografo } from "./comunes";
import s from "./panel.module.css";

/** Totales arriba + tabla de pedidos (en móvil, tarjetas apiladas). */
export function TablaVentas({ pedidos, albumes }: { pedidos: Pedido[]; albumes?: Map<string, Album> }) {
  const vendido = pedidos.reduce((t, p) => t + p.cotizacion.total, 0);
  const comision = pedidos.reduce((t, p) => t + p.comision, 0);
  const unidades = pedidos.reduce((t, p) => t + p.cotizacion.cantidad, 0);
  return (
    <>
      <div className={s.cifras}>
        <Cifra etiqueta="Ventas" valor={plata(vendido)} />
        <Cifra etiqueta="Comisión de la plataforma" valor={plata(comision)} nota="Según tu plan al momento de cada venta." />
        <Cifra etiqueta="Neto para vos" valor={plata(vendido - comision)} />
        <Cifra etiqueta="Pedidos" valor={pedidos.length} nota={`${unidades} ${unidades === 1 ? "foto o video" : "fotos y videos"}`} />
      </div>
      {pedidos.length === 0 ? (
        <Vacio>
          <strong style={{ color: "var(--fg)" }}>Todavía no hay ventas.</strong>
          <span>Cuando alguien pague (en la demo, con el pago simulado) aparece acá solo, aunque pague desde otra pestaña.</span>
        </Vacio>
      ) : (
        <div className={s.tablaCaja}>
          <table className={s.tabla}>
            <caption className="sr-only">Pedidos pagados</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                {albumes ? <th scope="col">Álbum</th> : null}
                <th scope="col">Comprador</th>
                <th scope="col" className={s.num}>
                  Cant.
                </th>
                <th scope="col">Cupón</th>
                <th scope="col" className={s.num}>
                  Total
                </th>
                <th scope="col" className={s.num}>
                  Comisión
                </th>
                <th scope="col" className={s.num}>
                  Neto
                </th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id}>
                  <td data-etiqueta="Fecha" className="mono">
                    {fechaHora(p.creadoEn)}
                  </td>
                  {albumes ? <td data-etiqueta="Álbum">{albumes.get(p.albumId)?.nombre ?? "Álbum eliminado"}</td> : null}
                  <td data-etiqueta="Comprador">
                    <span className={s.celdaDoble}>
                      <span>{p.comprador.nombre}</span>
                      <span className={`mono ${s.ayudaChica}`}>{p.comprador.email}</span>
                    </span>
                  </td>
                  <td data-etiqueta="Cantidad" className={`mono ${s.num}`}>
                    {p.cotizacion.cantidad}
                  </td>
                  <td data-etiqueta="Cupón" className="mono">
                    {p.cotizacion.cupon ? `${p.cotizacion.cupon.codigo} (−${plata(p.cotizacion.cupon.descuento)})` : "—"}
                  </td>
                  <td data-etiqueta="Total" className={`mono ${s.num}`}>
                    {plata(p.cotizacion.total)}
                  </td>
                  <td data-etiqueta="Comisión" className={`mono ${s.num}`}>
                    {plata(p.comision)}
                  </td>
                  <td data-etiqueta="Neto" className={`mono ${s.num}`}>
                    <strong>{plata(p.cotizacion.total - p.comision)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Ventas de un álbum (sección del álbum). */
export function SeccionVentas({ album }: { album: Album }) {
  const d = useDatos(() => obtenerRepo().pedidosDe(album.id), [album.id], ["pedidos"]);
  return (
    <Seccion titulo="Ventas de este álbum" bajada="Pagos simulados (modo demostración). Se actualiza sola.">
      {d.estado === "cargando" ? <Cargando /> : null}
      {d.estado === "error" ? <ErrorCarga error={d.error} /> : null}
      {d.estado === "listo" ? <TablaVentas pedidos={d.datos} /> : null}
    </Seccion>
  );
}

/** /panel/ventas */
export function VentasGlobal() {
  const f = useFotografo();
  const [filtro, setFiltro] = useState("todos");
  const d = useDatos(() => obtenerRepo().pedidosDeFotografo(f.id), [f.id], ["pedidos"]);
  const a = useAlbumes(f.id);
  const albumes = new Map((a.datos ?? []).map((x) => [x.id, x]));
  const pedidos = d.estado === "listo" ? (filtro === "todos" ? d.datos : d.datos.filter((p) => p.albumId === filtro)) : [];

  return (
    <>
      <Encabezado
        titulo="Ventas"
        bajada="Todos tus pedidos pagados. Los pagos son simulados (modo demostración). La lista se actualiza sola: si alguien paga en otra pestaña, aparece acá."
      />
      {(a.datos?.length ?? 0) > 1 ? (
        <div className={s.filtroAlbum}>
          <Selector etiqueta="Álbum" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="todos">Todos los álbumes</option>
            {(a.datos ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </Selector>
        </div>
      ) : null}
      {d.estado === "cargando" ? <Cargando /> : null}
      {d.estado === "error" ? <ErrorCarga error={d.error} /> : null}
      {d.estado === "listo" ? <TablaVentas pedidos={pedidos} albumes={albumes} /> : null}
    </>
  );
}
