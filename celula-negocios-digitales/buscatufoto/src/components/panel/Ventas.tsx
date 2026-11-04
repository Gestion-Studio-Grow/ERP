"use client";

import { useState } from "react";
import { Boton, Insignia, Selector, Vacio } from "@/components/ui";
import { fechaHora, plata } from "@/lib/dinero";
import { useDatos } from "@/lib/hooks";
import { mensajeDeError, obtenerRepo, useModoRepo } from "@/lib/repo";
import type { Album, Pedido } from "@/lib/tipos";
import { Cargando, Cifra, Encabezado, ErrorCarga, Seccion, useAlbumes, useFotografo } from "./comunes";
import s from "./panel.module.css";

/** Estado + acción: sólo una transferencia pendiente se marca a mano, con confirmación. */
function EstadoPedido({ p }: { p: Pedido }) {
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const metodo = p.metodo === "transferencia" ? "Transferencia" : "Mercado Pago";
  if (p.estado === "pagado") {
    return (
      <span className={s.celdaDoble}>
        <Insignia tono="ok">Pagado</Insignia>
        <span className={s.ayudaChica}>{metodo}</span>
      </span>
    );
  }
  async function marcar() {
    setOcupado(true);
    setError(null);
    try {
      await obtenerRepo().marcarPagado(p.id);
    } catch (e) {
      setError(mensajeDeError(e));
      setOcupado(false);
    }
  }
  return (
    <span className={s.celdaDoble}>
      <Insignia>Pendiente</Insignia>
      <span className={s.ayudaChica}>{metodo}</span>
      {p.metodo === "transferencia" ? (
        confirmar ? (
          <span>
            <span className={s.ayudaChica}>¿Te llegaron {plata(p.cotizacion.total)}? </span>
            <Boton tam="chico" variante="primario" onClick={marcar} disabled={ocupado}>
              {ocupado ? "Marcando…" : "Sí, marcar pagado"}
            </Boton>{" "}
            <Boton tam="chico" variante="fantasma" onClick={() => setConfirmar(false)} disabled={ocupado}>
              Cancelar
            </Boton>
          </span>
        ) : (
          <Boton tam="chico" onClick={() => setConfirmar(true)}>
            Marcar pagado
          </Boton>
        )
      ) : null}
      {error ? (
        <span role="alert" className={s.error}>
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Totales arriba (sólo pedidos pagados) + tabla de pedidos (en móvil, tarjetas apiladas). */
export function TablaVentas({ pedidos, albumes }: { pedidos: Pedido[]; albumes?: Map<string, Album> }) {
  const pagados = pedidos.filter((p) => p.estado !== "pendiente");
  const pendientes = pedidos.length - pagados.length;
  const vendido = pagados.reduce((t, p) => t + p.cotizacion.total, 0);
  const comision = pagados.reduce((t, p) => t + p.comision, 0);
  const unidades = pagados.reduce((t, p) => t + p.cotizacion.cantidad, 0);
  return (
    <>
      <div className={s.cifras}>
        <Cifra etiqueta="Ventas" valor={plata(vendido)} />
        <Cifra etiqueta="Comisión de la plataforma" valor={plata(comision)} nota="Según tu plan al momento de cada venta." />
        <Cifra etiqueta="Neto para vos" valor={plata(vendido - comision)} />
        <Cifra
          etiqueta="Pedidos pagados"
          valor={pagados.length}
          nota={`${unidades} ${unidades === 1 ? "foto o video" : "fotos y videos"}${pendientes ? ` · ${pendientes} pendiente${pendientes === 1 ? "" : "s"} de pago` : ""}`}
        />
      </div>
      {pedidos.length === 0 ? (
        <Vacio>
          <strong style={{ color: "var(--fg)" }}>Todavía no hay ventas.</strong>
          <span>Cuando alguien pague (en la demo, con el pago simulado) aparece acá solo, aunque pague desde otra pestaña.</span>
        </Vacio>
      ) : (
        <div className={s.tablaCaja}>
          <table className={s.tabla}>
            <caption className="sr-only">Pedidos</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                {albumes ? <th scope="col">Álbum</th> : null}
                <th scope="col">Comprador</th>
                <th scope="col" className={s.num}>
                  Cant.
                </th>
                <th scope="col">Estado</th>
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
                      {p.comprador.email ? <span className={`mono ${s.ayudaChica}`}>{p.comprador.email}</span> : null}
                    </span>
                  </td>
                  <td data-etiqueta="Cantidad" className={`mono ${s.num}`}>
                    {p.cotizacion.cantidad}
                  </td>
                  <td data-etiqueta="Estado">
                    <EstadoPedido p={p} />
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
  const demo = useModoRepo() === "demo";
  return (
    <Seccion titulo="Ventas de este álbum" bajada={demo ? "Pagos simulados (modo demostración). Se actualiza sola." : "Se actualiza sola."}>
      {d.estado === "cargando" ? <Cargando /> : null}
      {d.estado === "error" ? <ErrorCarga error={d.error} /> : null}
      {d.estado === "listo" ? <TablaVentas pedidos={d.datos} /> : null}
    </Seccion>
  );
}

/** /panel/ventas */
export function VentasGlobal() {
  const f = useFotografo();
  const demo = useModoRepo() === "demo";
  const [filtro, setFiltro] = useState("todos");
  const d = useDatos(() => obtenerRepo().pedidosDeFotografo(f.id), [f.id], ["pedidos"]);
  const a = useAlbumes(f.id);
  const albumes = new Map((a.datos ?? []).map((x) => [x.id, x]));
  const pedidos = d.estado === "listo" ? (filtro === "todos" ? d.datos : d.datos.filter((p) => p.albumId === filtro)) : [];

  return (
    <>
      <Encabezado
        titulo="Ventas"
        bajada={
          demo
            ? "Todos tus pedidos pagados. Los pagos son simulados (modo demostración). La lista se actualiza sola: si alguien paga en otra pestaña, aparece acá."
            : "Todos tus pedidos. La lista se actualiza sola."
        }
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
