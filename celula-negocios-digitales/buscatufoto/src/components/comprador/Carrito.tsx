"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Aviso, Boton, Dialogo, Entrada, Girador, IconoBasura, IconoFlecha, ModoDemo, Segmentado, SoloDemo, Vacio, claseEntrada } from "@/components/ui";
import { plata } from "@/lib/dinero";
import { cotizar, precioUnitario } from "@/lib/precios";
import { ErrorRepo, mensajeDeError, mpDisponible, obtenerRepo, useModoRepo } from "@/lib/repo";
import type { Album, Cotizacion, Fotografo, Medio, MetodoCobro, Pedido } from "@/lib/tipos";
import s from "./comprador.module.css";
import { Miniatura } from "./Miniatura";
import { listaDorsales, nombreMedio, sugerencia } from "./textos";

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Paso = "carrito" | "pago";

/**
 * Carrito con cotización del repositorio (`repo.cotizar`: en modo servidor la calcula el servidor con los cupones
 * reales; en la demo, IndexedDB con el mismo motor). Pago: Mercado Pago (redirección al checkout del fotógrafo)
 * o transferencia (el pedido queda pendiente hasta que el fotógrafo lo marca pagado). En la demo, el pago es simulado.
 * El total que vale es el que devuelve `crearPedido`: el repositorio recalcula y consume el cupón.
 */
export function Carrito({
  abierto,
  onCerrar,
  album,
  fotografo,
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
  fotografo: Fotografo | null;
  medios: Medio[];
  seleccion: Medio[];
  indiceAlbum: (id: string) => number;
  cupon: string | null;
  onCupon: (c: string | null) => void;
  onQuitar: (id: string) => void;
  onVaciar: () => void;
}) {
  const router = useRouter();
  const modo = useModoRepo();
  const demo = modo !== "servidor";
  const conMp = modo !== undefined && mpDisponible();
  const [metodoElegido, setMetodo] = useState<MetodoCobro>("mercadopago");
  const metodo: MetodoCobro = conMp ? metodoElegido : "transferencia";
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
  const ids = seleccion.map((m) => m.id);
  const claveCot = `${album.id}|${ids.join(",")}|${cupon ?? ""}`;
  const [remota, setRemota] = useState<{ clave: string; cot: Cotizacion } | null>(null);
  const [errorCot, setErrorCot] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  // Cotización del repositorio con un respiro (debounce) para no pedirla en cada toque.
  useEffect(() => {
    if (!abierto || !ids.length) return;
    let vivo = true;
    const t = window.setTimeout(() => {
      obtenerRepo()
        .cotizar(album.id, ids, cupon)
        .then((c) => {
          if (!vivo) return;
          setRemota({ clave: claveCot, cot: c });
          setErrorCot(null);
        })
        .catch((e: unknown) => {
          if (vivo) setErrorCot(mensajeDeError(e));
        });
    }, 300);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
    // claveCot resume album.id, ids y cupon
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, claveCot, vuelta]);
  const cotizando = remota?.clave !== claveCot;
  // Mientras llega la cotización se muestra la última conocida (o la estimación local, sin cupones).
  const cot = remota?.cot ?? cotizar(album, items, null, medios.length);
  const cuponValido = !cotizando && cot.cupon ? cupon : null;
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
    if (!EMAIL_OK.test(email.trim())) err.email = "Revisá el email: con él identificamos tu pedido.";
    setErrores(err);
    if (err.nombre || err.email) return;
    setPagando(true);
    setErrorPago(null);
    try {
      const repo = obtenerRepo();
      let totalEsperado = congelado?.total ?? cot.total;
      if (sinCupon) {
        totalEsperado = (await repo.cotizar(album.id, ids, null)).total;
        quitarCupon();
        setCongelado({ total: totalEsperado, cupon: null });
      }
      const cuponFinal = sinCupon ? null : (congelado?.cupon ?? cuponValido);
      const pedido = await repo.crearPedido({
        albumId: album.id,
        items: ids,
        comprador: { nombre: nombre.trim(), email: email.trim(), whatsapp: whatsapp.trim() },
        cupon: cuponFinal,
        totalEsperado,
        metodo,
      });
      // Si el repositorio recalculó (cambió un precio o un cupón), mostramos el total real antes de seguir.
      const ajustado = pedido.cotizacion.total !== totalEsperado;
      setHecho({ pedido, ajustado });
      onVaciar();
      onCupon(null);
      if (!ajustado) {
        seguir(pedido);
        return;
      }
      setPagando(false);
    } catch (e) {
      setPagando(false);
      if (e instanceof ErrorRepo && e.codigo === "precio") {
        // Se muestra el total nuevo y se pide confirmar otra vez: nunca se cobra un monto que no se vio.
        setCongelado(null);
        setRemota(null);
        setVuelta((v) => v + 1);
        setErrorPago({ mensaje: `${e.message} Revisá el total nuevo y confirmá otra vez.`, porCupon: false });
      } else if (e instanceof ErrorRepo && e.codigo === "cupon") {
        setErrorPago({ mensaje: `No pudimos aplicar el cupón: ${e.message}`, porCupon: true });
      } else {
        setErrorPago({ mensaje: mensajeDeError(e), porCupon: false });
      }
    }
  }

  /** Después de crear el pedido: Mercado Pago real → checkout; si no, a la página del pedido. */
  function seguir(pedido: Pedido) {
    if (!demo && pedido.metodo === "mercadopago" && pedido.initPoint) {
      window.location.assign(pedido.initPoint);
      return;
    }
    router.push(`/a/${album.slug}/pedido/${pedido.id}?clave=${encodeURIComponent(pedido.clave)}`);
  }

  if (hecho) {
    const { pedido } = hecho;
    const irADescargas = () => seguir(pedido);
    const titulo = demo
      ? "Pago confirmado (demostración)"
      : pedido.metodo === "mercadopago" && pedido.initPoint
        ? "Te llevamos a Mercado Pago"
        : "Pedido creado";
    return (
      <Dialogo abierto={abierto} onCerrar={irADescargas} titulo={titulo}>
        <div className={s.texto}>
          {hecho.ajustado ? (
            <Aviso tono="ok">
              Al confirmar, el total se recalculó y quedó en <strong className="mono">{plata(pedido.cotizacion.total)}</strong>. Ese es el
              monto del pedido.
            </Aviso>
          ) : (
            <p className={s.estadoFila}>
              <Girador etiqueta="Abriendo tu pedido" /> Listo. Te llevamos a tu pedido…
            </p>
          )}
          <Boton variante="primario" onClick={irADescargas}>
            {!demo && pedido.metodo === "mercadopago" && pedido.initPoint ? "Ir a pagar con Mercado Pago" : "Ver mi pedido"} <IconoFlecha />
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
              disabled={cotizando}
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
            <Boton key="pagar" variante="primario" type="submit" form="form-pago" disabled={pagando || cotizando} aria-busy={pagando || undefined}>
              {pagando
                ? "Procesando…"
                : demo
                  ? `Pagar ${plata(congelado?.total ?? cot.total)} (demostración)`
                  : metodo === "mercadopago"
                    ? `Pagar ${plata(congelado?.total ?? cot.total)} con Mercado Pago`
                    : `Confirmar pedido por ${plata(congelado?.total ?? cot.total)}`}
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
          {cotizando ? (
            <p className={s.estadoFila}>
              <Girador etiqueta="Calculando el total" /> Calculando el total…
            </p>
          ) : null}
          {errorCot ? <Aviso tono="error">No pudimos calcular el total: {errorCot}</Aviso> : null}

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
            {cupon && !cotizando && cot.errorCupon ? (
              <span id="cupon-mensaje" role="alert" className={`${s.cuponMensaje} ${s.cuponError}`}>
                {cot.errorCupon}
              </span>
            ) : null}
            {cupon && !cotizando && cot.cupon ? (
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
          <SoloDemo>
            <Aviso tono="demo">
              <span>
                <ModoDemo /> <strong>Modo demostración: no se cobra nada ni se pide tarjeta.</strong> Con un cobro real, acá pagarías con
                Mercado Pago o transferencia.
              </span>
            </Aviso>
          </SoloDemo>
          {conMp ? (
            <Segmentado<MetodoCobro>
              etiqueta="Cómo querés pagar"
              valor={metodo}
              onChange={setMetodo}
              opciones={[
                { valor: "mercadopago", texto: "Mercado Pago" },
                { valor: "transferencia", texto: "Transferencia" },
              ]}
            />
          ) : modo === "servidor" ? (
            <Aviso>
              Por ahora este álbum se paga sólo por transferencia. Al confirmar te mostramos cómo pagar
              {fotografo ? ` a ${fotografo.nombre}` : ""}; las descargas se habilitan cuando el fotógrafo confirma que le llegó la plata.
            </Aviso>
          ) : null}
          {conMp && metodo === "mercadopago" && !demo ? (
            <p className={s.nota}>Te llevamos al checkout de Mercado Pago del fotógrafo. Al aprobarse el pago volvés acá y descargás.</p>
          ) : null}
          {conMp && metodo === "transferencia" ? (
            <p className={s.nota}>
              Le transferís directo al fotógrafo. Las descargas se habilitan cuando confirma que le llegó la plata.
            </p>
          ) : null}
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
            ayuda="Para identificar tu pedido. Guardá el enlace de tu pedido: es tu acceso a las descargas."
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
          {congelado && !cotizando && congelado.total !== cot.total && !errorPago ? (
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
