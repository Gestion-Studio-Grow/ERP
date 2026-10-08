"use client";

import Link from "next/link";
import { useState } from "react";
import { Aviso, Boton, BotonLink, Girador, IconoCopiar, IconoDescargar, IconoTilde, IconoWhatsapp, ModoDemo, Tarjeta } from "@/components/ui";
import { fechaHora, plata } from "@/lib/dinero";
import { useDatos } from "@/lib/hooks";
import { mensajeDeError, obtenerRepo } from "@/lib/repo";
import type { Album, Medio, Pedido, Fotografo } from "@/lib/tipos";
import s from "./comprador.module.css";
import { Miniatura } from "./Miniatura";
import { listaDorsales, nombreDescarga, nombreMedio } from "./textos";

interface DatosPedido {
  pedido: Pedido;
  album: Album | null;
  medios: Medio[];
  fotografo: Fotografo | null;
}

type EstadoItem = { estado: "bajando" } | { estado: "listo" } | { estado: "error"; mensaje: string };

/** Dispara la descarga de un Blob con su nombre y libera la URL después. */
function guardarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Página del pedido: el único lugar del comprador que toca originales, siempre vía
 * `descargarOriginal(pedido, clave, medio)`. Sin la clave correcta no hay nada.
 */
export function PedidoVista({ slug, pedidoId, clave }: { slug: string; pedidoId: string; clave: string }) {
  const datos = useDatos<DatosPedido | null>(
    async () => {
      const repo = obtenerRepo();
      const pedido = await repo.obtenerPedido(pedidoId, clave);
      if (!pedido) return null;
      const [album, medios, fotografo] = await Promise.all([
        repo.obtenerAlbum(pedido.albumId),
        repo.mediosDe(pedido.albumId),
        repo.obtenerFotografo(pedido.fotografoId),
      ]);
      return { pedido, album, medios, fotografo };
    },
    [pedidoId, clave],
    ["pedidos", "medios", "albumes"],
  );

  if (datos.estado === "cargando") {
    return (
      <div className={`contenedor ${s.estado}`}>
        <p className={s.estadoFila}>
          <Girador etiqueta="Buscando tu pedido" /> Buscando tu pedido…
        </p>
      </div>
    );
  }
  if (datos.estado === "error") {
    return (
      <div className={`contenedor ${s.estado}`}>
        <h1 className="titulo-l">No pudimos abrir tu pedido</h1>
        <Aviso tono="error">{datos.error}</Aviso>
        <Boton variante="primario" onClick={datos.recargar}>
          Reintentar
        </Boton>
      </div>
    );
  }
  if (!datos.datos) {
    return (
      <div className={`contenedor ${s.estado}`}>
        <p className="rotulo">Pedido</p>
        <h1 className="titulo-l">No encontramos ese pedido o el enlace está incompleto</h1>
        <p className="bajada">
          El enlace de descarga trae una clave al final. Si lo copiaste a mano, fijate que esté entero. En esta demo, los pedidos quedan
          guardados sólo en el navegador donde se pagaron.
        </p>
        <BotonLink href={`/a/${slug}`} variante="primario">
          Volver al álbum
        </BotonLink>
      </div>
    );
  }
  return <PedidoListo {...datos.datos} slug={slug} />;
}

function PedidoListo({ pedido, album, medios, fotografo, slug }: DatosPedido & { slug: string }) {
  const [estados, setEstados] = useState<Record<string, EstadoItem>>({});
  const [todo, setTodo] = useState<{ hechas: number; total: number } | null>(null);
  const [copiado, setCopiado] = useState<"si" | "no" | null>(null);

  const posiciones = new Map(medios.map((m, i) => [m.id, i]));
  const cot = pedido.cotizacion;
  const albumSlug = album?.slug ?? slug;

  async function descargar(medioId: string, i: number): Promise<boolean> {
    setEstados((e) => ({ ...e, [medioId]: { estado: "bajando" } }));
    try {
      const blob = await obtenerRepo().descargarOriginal(pedido.id, pedido.clave, medioId);
      const m = medios[posiciones.get(medioId) ?? -1];
      guardarBlob(blob, nombreDescarga(m?.nombreArchivo, blob.type, i));
      setEstados((e) => ({ ...e, [medioId]: { estado: "listo" } }));
      return true;
    } catch (err) {
      setEstados((e) => ({ ...e, [medioId]: { estado: "error", mensaje: mensajeDeError(err) } }));
      return false;
    }
  }

  async function descargarTodo() {
    setTodo({ hechas: 0, total: pedido.items.length });
    for (let i = 0; i < pedido.items.length; i++) {
      await descargar(pedido.items[i], i);
      setTodo({ hechas: i + 1, total: pedido.items.length });
      // un respiro entre archivos: algunos navegadores frenan varias descargas seguidas
      if (i < pedido.items.length - 1) await esperar(450);
    }
    setTodo(null);
  }

  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado("si");
    } catch {
      setCopiado("no");
    }
  }

  function enviarWhatsapp() {
    const texto = `Mis fotos de ${album?.nombre ?? "buscatufoto"} para descargar: ${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
  }

  const bajandoTodo = todo !== null;

  return (
    <div className={`contenedor ${s.pagina}`}>
      <header className={s.pedidoCabeza}>
        <p className="rotulo">
          Pedido <span className="mono">{pedido.referenciaPago}</span> · <ModoDemo>Pago de demostración</ModoDemo>
        </p>
        <h1 className="titulo-xl">Listo, ya son tuyas</h1>
        <p className="bajada">
          {album ? (
            <>
              Tus fotos de <Link href={`/a/${albumSlug}`}>{album.nombre}</Link>, sin marca de agua y en tamaño original.
            </>
          ) : (
            "Tus fotos sin marca de agua y en tamaño original."
          )}
        </p>
        {fotografo ? (
          <p className="bajada">
            ¿Algún problema con una descarga? Escribile a {fotografo.nombre}:{" "}
            <a href={`mailto:${fotografo.email}?subject=${encodeURIComponent(`Pedido ${pedido.referenciaPago}`)}`}>
              {fotografo.email}
            </a>
          </p>
        ) : null}
      </header>

      <Aviso>
        <span style={{ display: "grid", gap: 8, justifyItems: "start" }}>
          <strong>Guardá este enlace: es la llave de tus descargas.</strong>
          <span>Quien lo tenga puede bajar estas fotos, así que compartilo sólo con quien quieras.</span>
          <span className={s.listaAcciones}>
            <Boton tam="chico" onClick={copiarEnlace}>
              {copiado === "si" ? <IconoTilde /> : <IconoCopiar />} {copiado === "si" ? "Enlace copiado" : "Copiar enlace"}
            </Boton>
            <Boton tam="chico" className={s.botonLargo} onClick={enviarWhatsapp}>
              <IconoWhatsapp /> Enviarme el enlace por WhatsApp <ModoDemo />
            </Boton>
          </span>
          {copiado === "no" ? <span role="alert">No pudimos copiarlo: copialo desde la barra de direcciones.</span> : null}
        </span>
      </Aviso>

      <div className={s.pedidoGrilla}>
        <section className={s.bloque} aria-labelledby="titulo-descargas">
          <div className={s.galeriaCabeza} style={{ marginBottom: 0 }}>
            <h2 id="titulo-descargas" className="titulo-m">
              {pedido.items.length === 1 ? "Tu archivo" : `Tus ${pedido.items.length} archivos`}
            </h2>
            <Boton variante="primario" onClick={descargarTodo} disabled={bajandoTodo} aria-busy={bajandoTodo || undefined}>
              <IconoDescargar />
              {todo ? `Descargando ${Math.min(todo.hechas + 1, todo.total)} de ${todo.total}…` : "Descargar todo"}
            </Boton>
          </div>
          <ul className={s.descargas}>
            {pedido.items.map((id, i) => {
              const pos = posiciones.get(id);
              const m = pos != null ? medios[pos] : null;
              const nombre = m ? nombreMedio(m, pos!) : `Archivo ${i + 1}`;
              const st = estados[id];
              return (
                <li key={id} className={s.descarga}>
                  <span className={s.filaImg}>{m ? <Miniatura blob={m.miniatura} alt="" /> : null}</span>
                  <span className={s.filaTexto}>
                    <span>{nombre}</span>
                    {m ? (
                      <small className="mono">
                        {m.nombreArchivo}
                        {m.dorsales.length ? ` · #${listaDorsales(m.dorsales)}` : ""}
                      </small>
                    ) : (
                      <small>El fotógrafo lo quitó del álbum.</small>
                    )}
                    {st?.estado === "error" ? (
                      <span role="alert" className={`${s.estadoDescarga} ${s.cuponError}`}>
                        {st.mensaje}
                      </span>
                    ) : st?.estado === "listo" ? (
                      <span className={`${s.estadoDescarga} ${s.ahorro}`}>Descargado</span>
                    ) : null}
                  </span>
                  <span className={s.descargaAccion}>
                    <Boton
                      ancho
                      onClick={() => void descargar(id, i)}
                      disabled={st?.estado === "bajando" || bajandoTodo}
                      aria-label={`Descargar original de ${nombre.toLowerCase()}`}
                    >
                      {st?.estado === "bajando" ? <Girador etiqueta="Descargando" /> : <IconoDescargar />}
                      Descargar original
                    </Boton>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <Tarjeta as="section">
          <div className={s.bloque}>
            <h2 className="titulo-m">Resumen</h2>
            <dl className={s.cuentas} style={{ marginTop: 0, borderTop: 0, paddingTop: 0 }}>
              <div>
                <dt>Fecha</dt>
                <dd>{fechaHora(pedido.creadoEn)}</dd>
              </div>
              <div>
                <dt>Referencia</dt>
                <dd className="mono">{pedido.referenciaPago}</dd>
              </div>
              <div>
                <dt>A nombre de</dt>
                <dd style={{ overflowWrap: "anywhere" }}>{pedido.comprador.nombre}</dd>
              </div>
              <div>
                <dt>Archivos</dt>
                <dd className="mono">{cot.cantidad}</dd>
              </div>
              <div>
                <dt>Precio de lista</dt>
                <dd className="mono">{plata(cot.lista)}</dd>
              </div>
              {cot.ahorroCantidad > 0 ? (
                <div>
                  <dt>{cot.regla.etiqueta}</dt>
                  <dd className={`mono ${s.ahorro}`}>− {plata(cot.ahorroCantidad)}</dd>
                </div>
              ) : null}
              {cot.cupon ? (
                <div>
                  <dt>
                    Cupón <span className="mono">{cot.cupon.codigo}</span>
                  </dt>
                  <dd className={`mono ${s.ahorro}`}>− {plata(cot.cupon.descuento)}</dd>
                </div>
              ) : null}
              <div className={s.total}>
                <dt>Total</dt>
                <dd className="mono">{plata(cot.total)}</dd>
              </div>
            </dl>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>
              Pago simulado: no se cobró nada. Con cobros reales, el comprobante llegaría a tu email.
            </p>
            <BotonLink href={`/a/${albumSlug}`} variante="fantasma">
              Volver al álbum
            </BotonLink>
          </div>
        </Tarjeta>
      </div>
    </div>
  );
}
