"use client";

import { useState } from "react";
import { Aviso, Boton, Entrada, IconoBasura, IconoMas } from "@/components/ui";
import { plata } from "@/lib/dinero";
import { nuevoId } from "@/lib/ids";
import { cotizar } from "@/lib/precios";
import { mensajeDeError, obtenerRepo } from "@/lib/repo";
import type { Album, Medio } from "@/lib/tipos";
import { aEntero, Seccion } from "./comunes";
import s from "./panel.module.css";

interface PaqueteB {
  id: string;
  nombre: string;
  cantidad: string;
  precio: string;
}
interface EscalonB {
  id: string;
  desde: string;
  porcentaje: string;
}
interface Borrador {
  precioFoto: string;
  precioVideo: string;
  paquetes: PaqueteB[];
  escalones: EscalonB[];
}

function desdeAlbum(a: Album): Borrador {
  return {
    precioFoto: String(a.precioFoto),
    precioVideo: String(a.precioVideo),
    paquetes: a.paquetes.map((p) => ({ id: p.id, nombre: p.nombre, cantidad: String(p.cantidad), precio: String(p.precio) })),
    escalones: a.escalones.map((e, i) => ({ id: `e${i}`, desde: String(e.desde), porcentaje: String(e.porcentaje) })),
  };
}

/** Comparación que ignora los ids internos de los escalones. */
function firma(b: Borrador) {
  return JSON.stringify({ ...b, escalones: b.escalones.map(({ desde, porcentaje }) => [desde.trim(), porcentaje.trim()]) });
}

/** Convierte el borrador; `error` si algo no es un número entero. */
function aDatos(b: Borrador): { datos: Pick<Album, "precioFoto" | "precioVideo" | "paquetes" | "escalones">; error: string | null } {
  let error: string | null = null;
  const precioFoto = aEntero(b.precioFoto);
  const precioVideo = b.precioVideo.trim() === "" ? 0 : aEntero(b.precioVideo);
  if (!Number.isFinite(precioFoto)) error ??= "Poné el precio por foto en pesos, sin centavos.";
  if (!Number.isFinite(precioVideo)) error ??= "El precio por video va en pesos, sin centavos (0 = igual que una foto).";
  const paquetes = b.paquetes.map((p) => {
    const cantidad = aEntero(p.cantidad);
    const precio = aEntero(p.precio);
    if (!Number.isFinite(cantidad) || cantidad < 0) error ??= `Revisá la cantidad del paquete “${p.nombre || "sin nombre"}” (0 = todo el álbum).`;
    if (!Number.isFinite(precio)) error ??= `Revisá el precio del paquete “${p.nombre || "sin nombre"}”.`;
    return { id: p.id, nombre: p.nombre.trim(), cantidad, precio };
  });
  const escalones = b.escalones.map((e) => {
    const desde = aEntero(e.desde);
    const porcentaje = aEntero(e.porcentaje);
    if (!Number.isFinite(desde) || !Number.isFinite(porcentaje)) error ??= "Los descuentos por cantidad llevan números enteros: desde cuántas y qué porcentaje.";
    return { desde, porcentaje };
  });
  return { datos: { precioFoto, precioVideo, paquetes, escalones }, error };
}

export function SeccionPrecios({ album, medios }: { album: Album; medios: Medio[] }) {
  const [b, setB] = useState<Borrador>(() => desdeAlbum(album));
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const cambiado = firma(b) !== firma(desdeAlbum(album));
  const editar = (c: (x: Borrador) => Borrador) => {
    setOk(false);
    setB(c);
  };
  const setPaquete = (id: string, c: Partial<PaqueteB>) => editar((x) => ({ ...x, paquetes: x.paquetes.map((p) => (p.id === id ? { ...p, ...c } : p)) }));
  const setEscalon = (id: string, c: Partial<EscalonB>) => editar((x) => ({ ...x, escalones: x.escalones.map((e) => (e.id === id ? { ...e, ...c } : e)) }));

  async function guardar() {
    setError(null);
    setOk(false);
    const { datos, error: e } = aDatos(b);
    if (e) return setError(e);
    setOcupado(true);
    try {
      const a = await obtenerRepo().actualizarAlbum(album.id, datos);
      setB(desdeAlbum(a));
      setOk(true);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  }

  // Vista previa: usa el borrador tal como está (lo que no es número cuenta como 0).
  const { datos } = aDatos(b);
  const limpio = {
    precioFoto: Number.isFinite(datos.precioFoto) ? datos.precioFoto : 0,
    precioVideo: Number.isFinite(datos.precioVideo) ? datos.precioVideo : 0,
    paquetes: datos.paquetes.filter((p) => Number.isFinite(p.cantidad) && Number.isFinite(p.precio) && p.cantidad >= 0),
    escalones: datos.escalones.filter((e) => Number.isFinite(e.desde) && Number.isFinite(e.porcentaje)),
    cupones: [],
  };
  const total = medios.length;
  const ejemplos = [1, 3, 5, 10].filter((n) => total === 0 || n <= Math.max(total, 1));
  if (total > 10) ejemplos.push(total);

  return (
    <>
      <Seccion titulo="Precio por unidad" bajada="En pesos, sin centavos. Es el precio de lista: los paquetes y descuentos se calculan sobre esto.">
        <div className={s.grilla2}>
          <Entrada etiqueta="Precio por foto (ARS)" inputMode="numeric" value={b.precioFoto} onChange={(e) => editar((x) => ({ ...x, precioFoto: e.target.value }))} />
          <Entrada
            etiqueta="Precio por video (ARS)"
            inputMode="numeric"
            value={b.precioVideo}
            onChange={(e) => editar((x) => ({ ...x, precioVideo: e.target.value }))}
            ayuda="0 = lo mismo que una foto."
          />
        </div>
      </Seccion>

      <Seccion
        titulo="Paquetes de precio fijo"
        bajada="Ej.: “3 fotos por $ 8.500”. Con cantidad 0 el paquete es “todo el álbum” y aplica sólo cuando se lleva todo."
        acciones={
          <Boton tam="chico" onClick={() => editar((x) => ({ ...x, paquetes: [...x.paquetes, { id: nuevoId("pq_"), nombre: "", cantidad: "3", precio: "" }] }))}>
            <IconoMas /> Agregar paquete
          </Boton>
        }
      >
        {b.paquetes.length === 0 ? <p className={s.ayudaChica}>Sin paquetes. Se cobra por unidad (y el descuento por cantidad, si hay).</p> : null}
        <ul className={s.listaFilas}>
          {b.paquetes.map((p) => (
            <li key={p.id} className={s.filaEdicion}>
              <Entrada etiqueta="Nombre" value={p.nombre} onChange={(e) => setPaquete(p.id, { nombre: e.target.value })} placeholder="Ej.: 3 fotos" />
              <Entrada
                etiqueta="Cantidad"
                inputMode="numeric"
                value={p.cantidad}
                onChange={(e) => setPaquete(p.id, { cantidad: e.target.value })}
                ayuda={p.cantidad.trim() === "0" ? "Todo el álbum" : undefined}
              />
              <Entrada etiqueta="Precio (ARS)" inputMode="numeric" value={p.precio} onChange={(e) => setPaquete(p.id, { precio: e.target.value })} />
              <Boton
                variante="fantasma"
                icono
                className={s.botonQuitar}
                aria-label={`Quitar el paquete ${p.nombre || "sin nombre"}`}
                title="Quitar"
                onClick={() => editar((x) => ({ ...x, paquetes: x.paquetes.filter((y) => y.id !== p.id) }))}
              >
                <IconoBasura />
              </Boton>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion
        titulo="Descuento por cantidad"
        bajada="Ej.: “25 % off llevando 5 o más”. Si hay varios, se aplica el mejor. No se suma con un paquete: el carrito elige lo más barato para el comprador."
        acciones={
          <Boton tam="chico" onClick={() => editar((x) => ({ ...x, escalones: [...x.escalones, { id: nuevoId("e_"), desde: "5", porcentaje: "20" }] }))}>
            <IconoMas /> Agregar descuento
          </Boton>
        }
      >
        {b.escalones.length === 0 ? <p className={s.ayudaChica}>Sin descuento por cantidad.</p> : null}
        <ul className={s.listaFilas}>
          {b.escalones.map((e) => (
            <li key={e.id} className={s.filaEdicion}>
              <Entrada etiqueta="Desde (unidades)" inputMode="numeric" value={e.desde} onChange={(ev) => setEscalon(e.id, { desde: ev.target.value })} />
              <Entrada etiqueta="Descuento (%)" inputMode="numeric" value={e.porcentaje} onChange={(ev) => setEscalon(e.id, { porcentaje: ev.target.value })} />
              <Boton
                variante="fantasma"
                icono
                className={s.botonQuitar}
                aria-label={`Quitar el descuento desde ${e.desde}`}
                title="Quitar"
                onClick={() => editar((x) => ({ ...x, escalones: x.escalones.filter((y) => y.id !== e.id) }))}
              >
                <IconoBasura />
              </Boton>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo="Así queda el precio" bajada="Ejemplos con fotos, calculados igual que en el carrito.">
        <ul className={s.ejemplos}>
          {ejemplos.map((n) => {
            const c = cotizar(limpio, Array.from({ length: n }, () => ({ tipo: "foto" as const })), null, total);
            return (
              <li key={n}>
                <span>
                  Ejemplo: <span className="mono">{n}</span> {n === 1 ? "foto" : "fotos"}
                  {n === total && total > 1 ? " (todo el álbum)" : ""}
                </span>
                <span className="mono">
                  {c.ahorroCantidad > 0 ? <del className={s.tachado}>{plata(c.lista)}</del> : null} <strong>{plata(c.subtotal)}</strong>
                </span>
                <span className={s.ayudaChica}>{c.regla.etiqueta}</span>
              </li>
            );
          })}
        </ul>
      </Seccion>

      <div className={s.barraGuardar} data-visible={cambiado || ok || !!error}>
        {error ? (
          <p role="alert" className={s.error}>
            {error}
          </p>
        ) : null}
        {ok ? <Aviso tono="ok">Precios guardados.</Aviso> : null}
        {cambiado ? (
          <div className={s.filaBotones}>
            <span className={s.ayudaChica}>Tenés cambios sin guardar.</span>
            <Boton variante="primario" onClick={guardar} disabled={ocupado}>
              {ocupado ? "Guardando…" : "Guardar precios"}
            </Boton>
            <Boton
              variante="fantasma"
              onClick={() => {
                setB(desdeAlbum(album));
                setError(null);
              }}
            >
              Descartar
            </Boton>
          </div>
        ) : null}
      </div>
    </>
  );
}
