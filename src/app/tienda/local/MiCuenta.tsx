"use client";

// «Mi cuenta» de Pedí Local, sin login: lo que se pidió desde ESTE navegador (localStorage, por
// negocio). Historial con el link al seguimiento, «Repetir pedido» (vuelve a la carta con la bolsa
// cargada y los precios de HOY: `/tienda?repetir=<clave>`), direcciones guardadas y un botón para
// borrar todo de este teléfono. Lo que se lee es del dispositivo: en el servidor y en la hidratación
// se ve la cuenta vacía y un instante después lo guardado (useSyncExternalStore).

import Link from "next/link";
import { useState } from "react";
import { olvidarDireccion, type PedidoGuardado } from "@/lib/delivery-local/mi-cuenta";
import { formatearCantidad } from "@/lib/pos-peso";
import { borrarCuenta, cambiarCuenta, useCuentaDelDispositivo } from "./cuenta-del-dispositivo";
import s from "./local.module.css";

const plata = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
// La ruta del seguimiento es la de `rutaDeSeguimiento` (src/lib/delivery-local/salida.ts), escrita acá
// para no sumar al paquete del navegador la config y los mensajes que importa ese módulo.
const fecha = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export default function MiCuenta({ slug }: { slug: string }) {
  const cuenta = useCuentaDelDispositivo(slug);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const vacia = cuenta.pedidos.length === 0 && cuenta.direcciones.length === 0;

  return (
    <div className={s.cuentaCuerpo}>
      <section aria-labelledby="mc-pedidos" className={s.cuentaBloque}>
        <h2 id="mc-pedidos" className={s.pedidoTitulo}>
          Tus pedidos
        </h2>
        {cuenta.pedidos.length === 0 ? (
          <div className={s.caja}>
            <p>Todavía no pediste desde este teléfono. Cuando mandes un pedido, lo vas a ver acá para seguirlo o repetirlo.</p>
            <Link href="/tienda#carta" className={`${s.boton} ${s.botonPrincipal}`}>
              Ver la carta
            </Link>
          </div>
        ) : (
          <ul className={s.historial}>
            {cuenta.pedidos.map((p) => (
              <PedidoDelHistorial key={p.clave} p={p} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="mc-direcciones" className={s.cuentaBloque}>
        <h2 id="mc-direcciones" className={s.pedidoTitulo}>
          Tus direcciones
        </h2>
        {cuenta.direcciones.length === 0 ? (
          <p className={s.ayuda}>La dirección de tu próximo envío queda guardada acá y la próxima vez se completa sola.</p>
        ) : (
          <ul className={s.direcciones}>
            {cuenta.direcciones.map((d) => (
              <li key={d.texto} className={s.direccion}>
                <span>{d.texto}</span>
                <button type="button" className={s.boton} onClick={() => cambiarCuenta(slug, (c) => olvidarDireccion(c, d.texto))} aria-label={`Olvidar la dirección ${d.texto}`}>
                  Olvidar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!vacia && (
        <section aria-labelledby="mc-borrar" className={s.cuentaBloque}>
          <h2 id="mc-borrar" className={s.leyenda}>
            ¿Teléfono compartido?
          </h2>
          {confirmarBorrado ? (
            <div className={`${s.caja} ${s.cajaAviso}`} role="group" aria-label="Confirmar el borrado">
              <p>Se borran tus pedidos y direcciones de este teléfono. Los pedidos siguen en el local.</p>
              <div className={s.opciones}>
                <button
                  type="button"
                  className={s.boton}
                  onClick={() => {
                    borrarCuenta(slug);
                    setConfirmarBorrado(false);
                  }}
                >
                  Sí, borrar
                </button>
                <button type="button" className={s.boton} onClick={() => setConfirmarBorrado(false)}>
                  No, dejarlo
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className={s.boton} onClick={() => setConfirmarBorrado(true)}>
              Borrar mis datos de este teléfono
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function PedidoDelHistorial({ p }: { p: PedidoGuardado }) {
  const titulo = p.code ? `Pedido #${p.code}` : "Pedido sin número todavía";
  const resumen = p.items.map((i) => `${formatearCantidad(i.cantidad)}${i.saleUnit === "WEIGHT" ? " kg" : " ×"} ${i.nombre}`).join(" · ");
  return (
    <li className={s.historialItem}>
      <div className={s.historialCabeza}>
        <h3 className={s.historialTitulo}>{titulo}</h3>
        <span className={s.historialTotal}>{plata.format(p.total)}</span>
      </div>
      <p className={s.ayuda}>
        {fecha.format(new Date(p.fecha))} · {p.fulfillment === "DELIVERY" ? "Envío" : "Retiro"}
        {p.estado ? ` · ${p.estado}` : ""}
      </p>
      <p className={s.historialResumen}>{resumen}</p>
      <div className={s.opciones}>
        <Link href={`/tienda?repetir=${encodeURIComponent(p.clave)}`} className={`${s.boton} ${s.botonAcento}`}>
          Repetir pedido
        </Link>
        {p.token && (
          <Link href={`/tienda/pedido/${encodeURIComponent(p.token)}`} className={s.boton}>
            {p.terminado ? "Ver el pedido" : "Seguir el pedido"}
          </Link>
        )}
      </div>
    </li>
  );
}
