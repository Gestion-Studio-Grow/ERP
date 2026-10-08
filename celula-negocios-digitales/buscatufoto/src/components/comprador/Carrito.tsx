"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Aviso, Boton, Dialogo, Entrada, Girador, IconoBasura, IconoFlecha, ModoDemo, Vacio, claseEntrada } from "@/components/ui";
import { plata } from "@/lib/dinero";
import { cotizar, precioUnitario } from "@/lib/precios";
import { ErrorRepo, mensajeDeError, obtenerRepo } from "@/lib/repo";
import type { Album, Cotizacion, Medio, Pedido } from "@/lib/tipos";
import s from "./comprador.module.css";
import { Miniatura } from "./Miniatura";
import { listaDorsales, nombreMedio, sugerencia } from "./textos";

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Paso = "carrito" | "pago";

/**
 * Carrito con cotización en vivo (mismo motor que usa el repositorio para cobrar) y pago simulado.
 * El total que vale es el que devuelve `crearPedido`: el repositorio recalcula y consume el cupón.
 */
export function Carrito({
  abierto,
  onCerrar,
  album,
  medios,
  seleccion,
  indiceAlbum,
  cupon,
  onCupon,
  onQuitar,
  onVaciar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  album: Album;
  medios: Medio[];
  seleccion: Medio[];
  indiceAlbum: (id: string) => number;
  cupon: string | null;
  onCupon: (c: string | null) => void;
  onQuitar: (id: string) => void;
  onVaciar: () => void;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>("carrito");
  const [cuponTexto, setCuponTexto] = useState(cupon ?? "");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [errores, setErrores] = useState<{ nombre?: string; email?: string }>({});
  const [errorPago, setErrorPago] = useState<{ mensaje: string; porCupon: boolean } | null>(null);
  const [pagando, setPagando] = useState(false);
  const [hecho, setHecho] = useState<{ pedido: Pedido; ajustado: boolean } | null>(null);
  // Lo que el comprador aceptó al pasar al pago: si cambia por detrás (cupón pausado, precio, paquete),
  // el repositorio rechaza el pago en vez de cobrar otro monto en silencio.
  const [congelado, setCongelado] = useState<{ total: number; cupon: string | null } | null>(null);
  const refNombre = useRef<HTMLInputElement>(null);

  const items = seleccion.map((m) => ({ tipo: m.tipo }));
  const cot = cotizar(album, items, cupon, medios.length);
  const cuponValido = cot.cupon ? cupon : null;
  const sug = sugerencia(album, items, medios.length);

  useEffect(() => {
    if (paso === "pago") refNombre.current?.focus();
  }, [paso]);

  function cerrar() {
    if (pagando) return;
    setPaso("carrito");
    setCongelado(null);
    setErrorPago(null);
    onCerrar();
  }

  function aplicarCupon(e?: FormEvent) {
    e?.preventDefault();
    const c = cuponTexto.trim().toUpperCase();
    setCuponTexto(c);
    onCupon(c || null);
  }

  function quitarCupon() {
    setCuponTexto("");
    onCupon(null);
  }

  async function pagar(sinCupon = false) {
    const err: typeof errores = {};
    if (!nombre.trim()) err.nombre = "Poné tu nombre.";
    if (!EMAIL_OK.test(email.trim())) err.email = "Revisá el email: ahí te mandaríamos las fotos.";
    setErrores(err);
    if (err.nombre || err.email) return;
    const sinCuponTotal = cotizar(album, items, null, medios.length).total;
    const cuponFinal = sinCupon ? null : (congelado?.cupon ?? cuponValido);
    const totalEsperado = sinCupon ? sinCuponTotal : (congelado?.total ?? cot.total);
    if (sinCupon) {
      quitarCupon();
      setCongelado({ total: sinCuponTotal, cupon: null });
    }
    setPagando(true);
    setErrorPago(null);
    try {
      const pedido = await obtenerRepo().crearPedido({
        albumId: album.id,
        items: seleccion.map((m) => m.id),
        comprador: { nombre, email, whatsapp },
        cupon: cuponFinal,
        totalEsperado,
      });
      const mostrado = totalEsperado;
      // Si el repositorio recalculó (cambió un precio o un cupón), mostramos el total real antes de seguir.
      const ajustado = pedido.cotizacion.total !== mostrado;
      setHecho({ pedido, ajustado });
      onVaciar();
      onCupon(null);
      setPagando(false);
      if (!ajustado) router.push(`/a/${album.slug}/pedido/${pedido.id}?clave=${pedido.clave}`);
    } catch (e) {
      setPagando(false);
      if (e instanceof ErrorRepo && e.codigo === "precio") {
        // Se muestra el total nuevo y se pide confirmar otra vez: nunca se cobra un monto que no se vio.
        setCongelado({ total: cot.total, cupon: cuponValido });
        setErrorPago({ mensaje: e.message, porCupon: false });
      } else if (e instanceof ErrorRepo && e.codigo === "cupon") {
        setErrorPago({ mensaje: `No pudimos aplicar el cupón: ${e.message}`, porCupon: true });
      } else {
        setErrorPago({ mensaje: mensajeDeError(e), porCupon: false });
      }
    }
  }

  if (hecho) {
    const { pedido } = hecho;
    const irADescargas = () => router.push(`/a/${album.slug}/pedido/${pedido.id}?clave=${pedido.clave}`);
    return (
      <Dialogo abierto={abierto} onCerrar={irADescargas} titulo="Pago confirmado (demostración)">
        <div className={s.texto}>
          {hecho.ajustado ? (
            <Aviso tono="ok">
              Al confirmar, el total se recalculó y quedó en <strong className="mono">{plata(pedido.cotizacion.total)}</strong>. Ese es el
              monto del pedido.
            </Aviso>
          ) : (
            <p className={s.estadoFila}>
              <Girador etiqueta="Abriendo tus descargas" /> Listo. Te llevamos a tus descargas…
            </p>
          )}
          <Boton variante="primario" onClick={irADescargas}>
            Ver mis descargas <IconoFlecha />
          </Boton>
        </div>
      </Dialogo>
    );
  }

  const vacio = seleccion.length === 0;

  return (
    <Dialogo
      abierto={abierto}
      onCerrar={cerrar}
      titulo={paso === "carrito" ? "Tu carrito" : "Pagar"}
      pie={
        vacio ? null : paso === "carrito" ? (
          <div className={s.pieDialogo}>
            <Boton key="seguir" variante="fantasma" onClick={cerrar}>
              Seguir eligiendo
            </Boton>
            <Boton
              key="continuar"
              variante="primario"
              onClick={(e) => {
                e.preventDefault();
                setCongelado({ total: cot.total, cupon: cuponValido });
                setErrorPago(null);
                setPaso("pago");
              }}
            >
              Continuar al pago <IconoFlecha />
            </Boton>
          </div>
        ) : (
          <div className={s.pieDialogo}>
            <Boton
              key="volver"
              variante="fantasma"
              onClick={() => {
                setPaso("carrito");
                setCongelado(null);
              }}
              disabled={pagando}
            >
              Volver al carrito
            </Boton>
            <Boton key="pagar" variante="primario" type="submit" form="form-pago" disabled={pagando} aria-busy={pagando || undefined}>
              {pagando ? "Procesando…" : `Pagar ${plata(congelado?.total ?? cot.total)} (demostración)`}
            </Boton>
          </div>
        )
      }
    >
      {vacio ? (
        <Vacio>
          <p>Tu carrito está vacío. Tocá “Agregar” en las fotos que te gusten.</p>
          <Boton onClick={cerrar}>Volver a la galería</Boton>
        </Vacio>
      ) : paso === "carrito" ? (
        <>
          <ul className={s.lista} aria-label="Fotos elegidas">
            {seleccion.map((m) => {
              const nombreItem = nombreMedio(m, indiceAlbum(m.id));
              return (
                <li key={m.id} className={s.fila}>
                  <span className={s.filaImg}>
                    <Miniatura blob={m.miniatura} alt="" />
                  </span>
                  <span className={s.filaTexto}>
                    <span>{nombreItem}</span>
                    {m.dorsales.length ? <small className="mono">#{listaDorsales(m.dorsales)}</small> : null}
                  </span>
                  <span className="mono">{plata(precioUnitario(album, m.tipo))}</span>
                  <Boton variante="fantasma" icono aria-label={`Quitar ${nombreItem.toLowerCase()}`} onClick={() => onQuitar(m.id)}>
                    <IconoBasura />
                  </Boton>
                </li>
              );
            })}
          </ul>

          <Cuentas cot={cot} />

          <form className={s.cupon} onSubmit={aplicarCupon}>
            <div className={s.campoCupon}>
              <label htmlFor="cupon-comprador" className={s.etiquetaCupon}>
                Cupón
              </label>
              <input
                id="cupon-comprador"
                className={`${claseEntrada} mono`}
                value={cuponTexto}
                onChange={(e) => setCuponTexto(e.target.value.replace(/\s/g, ""))}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={20}
                placeholder="CODIGO"
                aria-invalid={cot.errorCupon ? true : undefined}
                aria-describedby={cupon ? "cupon-mensaje" : undefined}
              />
            </div>
            <Boton type="submit" disabled={!cuponTexto.trim()}>
              Aplicar
            </Boton>
            {cupon && cot.errorCupon ? (
              <span id="cupon-mensaje" role="alert" className={`${s.cuponMensaje} ${s.cuponError}`}>
                {cot.errorCupon}
              </span>
            ) : null}
            {cupon && cot.cupon ? (
              <span id="cupon-mensaje" role="status" className={`${s.cuponMensaje} ${s.cuponOk}`}>
                <span>
                  Cupón <span className="mono">{cot.cupon.codigo}</span> aplicado: −{" "}
                  <span className="mono">{plata(cot.cupon.descuento)}</span>
                </span>
                <Boton variante="fantasma" tam="chico" onClick={quitarCupon}>
                  Quitar
                </Boton>
              </span>
            ) : null}
          </form>

          {sug ? (
            <p className={s.nota}>
              Sugerencia: llevando {sug.extra} {sug.extra === 1 ? "foto" : "fotos"} más se aplica «{sug.etiqueta}» y pagás{" "}
              <span className="mono">{plata(sug.total)}</span> por todo.
            </p>
          ) : null}
        </>
      ) : (
        <form
          id="form-pago"
          className={s.form}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void pagar();
          }}
        >
          <Aviso tono="demo">
            <span>
              <ModoDemo /> <strong>Modo demostración: no se cobra nada ni se pide tarjeta.</strong> Con un cobro real, acá pagarías con
              Mercado Pago o transferencia.
            </span>
          </Aviso>
          <Entrada
            ref={refNombre}
            etiqueta="Tu nombre"
            autoComplete="name"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            error={errores.nombre}
            disabled={pagando}
          />
          <Entrada
            etiqueta="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errores.email}
            ayuda="Te serviría para recuperar el enlace de descarga."
            disabled={pagando}
          />
          <Entrada
            etiqueta="WhatsApp (opcional)"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="11 2345 6789"
            disabled={pagando}
          />
          <dl className={s.cuentas} style={{ marginTop: 0 }}>
            <div>
              <dt>{seleccion.length === 1 ? "1 archivo" : `${seleccion.length} archivos`}</dt>
              <dd className="mono">{plata(cot.subtotal)}</dd>
            </div>
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
          {congelado && congelado.total !== cot.total && !errorPago ? (
            <Aviso tono="error">
              <div>
                El total cambió mientras completabas tus datos: era {plata(congelado.total)} y ahora es {plata(cot.total)}.{" "}
                <Boton tam="chico" onClick={() => setCongelado({ total: cot.total, cupon: cuponValido })}>
                  Aceptar el total nuevo
                </Boton>
              </div>
            </Aviso>
          ) : null}
          {errorPago ? (
            <Aviso tono="error">
              <span style={{ display: "grid", gap: 8, justifyItems: "start" }}>
                <span>{errorPago.mensaje}</span>
                {errorPago.porCupon ? (
                  <Boton tam="chico" onClick={() => void pagar(true)} disabled={pagando}>
                    Pagar sin cupón
                  </Boton>
                ) : null}
              </span>
            </Aviso>
          ) : null}
        </form>
      )}
    </Dialogo>
  );
}

function Cuentas({ cot }: { cot: Cotizacion }) {
  return (
    <dl className={s.cuentas} aria-live="polite">
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
  );
}
