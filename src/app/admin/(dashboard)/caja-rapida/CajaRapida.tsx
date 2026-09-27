"use client";

// LA CAJA CON LECTOR — un campo, el ticket y el cobro.
//
// EL FOCO SE QUEDA EN EL CAMPO. El lector "tipea" y manda Enter: si el foco se fue (alguien tocó
// el ticket), un dígito tecleado fuera de otro campo vuelve al campo del lector, así el código no
// se pierde. Después de cada lectura, de cada anulación y de cada cobro, el foco vuelve solo.
//
// LO QUE SE VE ES LA VISTA PREVIA: importes y promos con las mismas funciones que el servidor
// (ticket-caja.ts). Al cobrar, el servidor vuelve a decidir con la base y devuelve el ticket
// grabado; si algo cambió en el medio (un precio, una promo), lo dice.
//
// SIN CONFIRMAR: si la respuesta del cobro no llega, el ticket queda BLOQUEADO (no se puede tocar)
// y se reintenta con la MISMA clave: si se había grabado, vuelve esa venta y no se cobra dos veces.

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, cn, fmtMoneyARS } from "@/components/ui";
import TicketVenta from "../vender/TicketVenta";
import type { VentaTicket } from "../vender/reglas-venta";
import { cobrarVentaDeCaja, anularRenglonDeCaja } from "@/lib/supermercado/caja-actions";
import { buscarPorNombre, indexarPorCodigo, interpretarEntrada, resolverCodigo, type ProductoDeCaja } from "@/lib/supermercado/lectura";
import { agregarAlTicket, importeDelRenglon, quitarDelTicket, vistaDelTicket, type RenglonDeCaja } from "@/lib/supermercado/ticket-caja";
import { repartirPagos, type PagoIngresado } from "@/lib/supermercado/pago-mixto";
import type { FormatoBalanza } from "@/lib/supermercado/balanza";
import type { Promocion } from "@/lib/supermercado/promociones";
import { MEDIOS_DE_COBRO, etiquetaDeMedio, type MedioDeCobro } from "@/lib/caja/medio-cobro";
import { formatearCantidad, leerCantidad, leerImporte } from "@/lib/pos-peso";
import { centavosDe } from "@/lib/dinero/redondeo";

function nuevaClave(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `caja-${crypto.randomUUID()}`
    : `caja-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type Mensaje = { tono: "error" | "info"; texto: string } | null;
type PagoEnPantalla = { medio: MedioDeCobro; montoTexto: string };
type Anulando = { renglon: RenglonDeCaja; email: string; clave: string; error: string | null; enviando: boolean } | null;

export default function CajaRapida({
  productos,
  promos,
  formato,
  hoy,
  diaSemana,
  negocio,
  cajero,
  anulaSolo,
}: {
  productos: ProductoDeCaja[];
  promos: Promocion[];
  formato: FormatoBalanza;
  hoy: string;
  diaSemana: number;
  negocio: string;
  cajero: string;
  /** Quien cobra es dueño o encargado: anula un renglón sin pedir otra clave. */
  anulaSolo: boolean;
}) {
  const indice = useMemo(() => indexarPorCodigo(productos), [productos]);
  const campo = useRef<HTMLInputElement | null>(null);
  const contador = useRef(0);
  const [entrada, setEntrada] = useState("");
  const [multiplicador, setMultiplicador] = useState<number | null>(null);
  const [ticket, setTicket] = useState<RenglonDeCaja[]>([]);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [sugerencias, setSugerencias] = useState<ProductoDeCaja[]>([]);
  const [pesando, setPesando] = useState<{ producto: ProductoDeCaja; texto: string } | null>(null);
  const [pagos, setPagos] = useState<PagoEnPantalla[]>([{ medio: "EFECTIVO", montoTexto: "" }]);
  const [clave, setClave] = useState(nuevaClave);
  const [cobrando, setCobrando] = useState(false);
  const [sinConfirmar, setSinConfirmar] = useState<string | null>(null);
  const [cobrada, setCobrada] = useState<{ venta: VentaTicket; vuelto: number; pagoCon: number | null } | null>(null);
  const [anulando, setAnulando] = useState<Anulando>(null);

  const bloqueado = cobrando || sinConfirmar !== null;
  const volverAlCampo = () => requestAnimationFrame(() => campo.current?.focus());

  // Un dígito tecleado fuera de un campo (el lector con el foco perdido) va al campo del lector.
  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const enCampo = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (enCampo || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
      if (/^[0-9]$/.test(e.key) && campo.current) campo.current.focus();
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);
  useEffect(() => {
    campo.current?.focus();
  }, []);

  // Con un solo medio, las promos por medio de pago se ven antes de cobrar; con varios, no aplican.
  const mediosElegidos = new Set(pagos.map((p) => p.medio));
  const medioUnico = mediosElegidos.size === 1 ? pagos[0].medio : null;
  const vista = useMemo(
    () => vistaDelTicket(ticket, promos, { fecha: hoy, diaSemana, medio: medioUnico }),
    [ticket, promos, hoy, diaSemana, medioUnico],
  );
  const promoDe = useMemo(() => new Map(vista.promos.renglones.map((r) => [r.clave, r])), [vista]);

  // Lo que se cobra por cada medio. Un renglón sin monto paga LO QUE FALTA (con un solo medio,
  // el total exacto) si es el único vacío; si hay más de uno vacío, no suma hasta que se complete.
  const leidos = pagos.map((p) => {
    const l = leerImporte(p.montoTexto);
    return l.estado === "ok" ? l.valor : null;
  });
  const vacios = leidos.filter((x) => x === null).length;
  const faltaCentavos = centavosDe(vista.total) - leidos.reduce<number>((s, x) => s + centavosDe(x ?? 0), 0);
  const falta = Math.max(0, faltaCentavos) / 100;
  const pagosIngresados: PagoIngresado[] = pagos.map((p, i) => ({
    medio: p.medio,
    monto: leidos[i] ?? (vacios === 1 ? falta : 0),
  }));
  const reparto = ticket.length > 0 ? repartirPagos(vista.total, pagosIngresados) : null;

  function agregar(producto: ProductoDeCaja, cantidad: number, importe: number | null, porBalanza: boolean) {
    contador.current += 1;
    const r = agregarAlTicket(ticket, { producto, cantidad, importe, porBalanza }, `r${contador.current}`);
    setTicket(r.ticket);
    setUltimo(r.clave);
    setMultiplicador(null);
    setMensaje(null);
    setSugerencias([]);
    if (cobrada) setCobrada(null);
  }

  function leer() {
    if (bloqueado) return;
    const e = interpretarEntrada(entrada);
    setEntrada("");
    if (e.tipo === "vacia") return;
    if (e.tipo === "invalida") return setMensaje({ tono: "error", texto: e.mensaje });
    if (e.tipo === "multiplicador") {
      setMultiplicador(e.cantidad);
      setMensaje({ tono: "info", texto: `El próximo producto entra por ${e.cantidad}.` });
      return;
    }
    const mult = e.multiplicador ?? multiplicador;
    if (e.tipo === "busqueda") {
      const encontrados = buscarPorNombre(productos, e.texto);
      if (encontrados.length === 0) {
        setSugerencias([]);
        return setMensaje({ tono: "error", texto: `No encontramos «${e.texto}». Probá con otra palabra o pasá el código.` });
      }
      if (e.multiplicador) setMultiplicador(e.multiplicador);
      setSugerencias(encontrados);
      setMensaje({ tono: "info", texto: "Elegí el producto de la lista." });
      return;
    }
    const r = resolverCodigo(e.codigo, indice, formato, mult);
    if (!r.ok) return setMensaje({ tono: "error", texto: r.mensaje });
    if (r.cantidad === null) return setPesando({ producto: r.producto, texto: "" });
    agregar(r.producto, r.cantidad, r.importe, r.porBalanza);
  }

  function elegirSugerencia(p: ProductoDeCaja) {
    if (p.saleUnit === "WEIGHT") {
      setSugerencias([]);
      setPesando({ producto: p, texto: "" });
      return;
    }
    agregar(p, multiplicador ?? 1, null, false);
    volverAlCampo();
  }

  function confirmarPeso() {
    if (!pesando) return;
    const l = leerCantidad(pesando.texto);
    if (l.estado !== "ok" || !(l.valor > 0)) return setMensaje({ tono: "error", texto: "Escribí el peso en kilos, por ejemplo 0,350." });
    agregar(pesando.producto, l.valor, null, false);
    setPesando(null);
    volverAlCampo();
  }

  async function confirmarAnulacion() {
    if (!anulando) return;
    const r = anulando.renglon;
    setAnulando({ ...anulando, enviando: true, error: null });
    const res = await anularRenglonDeCaja({
      ticket: clave,
      renglon: { nombre: r.nombre, cantidad: r.cantidad, importe: importeDelRenglon(r) },
      ...(anulaSolo ? {} : { autoriza: { email: anulando.email, clave: anulando.clave } }),
    });
    if (!res.ok) {
      setAnulando({ ...anulando, enviando: false, error: res.error });
      return;
    }
    setTicket(quitarDelTicket(ticket, r.clave));
    setAnulando(null);
    setMensaje({ tono: "info", texto: `Se anuló «${r.nombre}». Autorizó ${res.autorizo}.` });
    volverAlCampo();
  }

  async function cobrar() {
    if (ticket.length === 0 || !reparto?.ok) return;
    setCobrando(true);
    setMensaje(null);
    const efectivo = pagosIngresados.find((p) => p.medio === "EFECTIVO");
    const res = await cobrarVentaDeCaja({
      clave,
      renglones: ticket.map((r) => ({ productId: r.productId, cantidad: r.cantidad, importe: r.importe })),
      pagos: pagosIngresados,
      cliente: null,
    }).catch(() => ({ ok: false as const, tipo: "sin-confirmar" as const, error: "Se cortó la conexión: no sabemos si la venta se grabó." }));
    setCobrando(false);
    if (!res.ok) {
      if (res.tipo === "sin-confirmar") setSinConfirmar(res.error);
      else setMensaje({ tono: "error", texto: res.error });
      return;
    }
    setSinConfirmar(null);
    setCobrada({ venta: res.venta, vuelto: res.vuelto, pagoCon: pagos.length === 1 && efectivo ? efectivo.monto : null });
    setTicket([]);
    setUltimo(null);
    setPagos([{ medio: "EFECTIVO", montoTexto: "" }]);
    setClave(nuevaClave());
    setMensaje(res.yaEstaba ? { tono: "info", texto: `La venta #${res.venta.code} ya estaba grabada: no se cobró dos veces.` } : null);
    volverAlCampo();
  }

  function cambiarMedio(i: number, medio: MedioDeCobro) {
    setPagos(pagos.map((p, k) => (k === i ? { ...p, medio } : p)));
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-label="Ticket" className="min-w-0 space-y-3">
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            leer();
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label htmlFor="lector" className="w-full text-sm font-medium text-strong">
            Código, etiqueta de balanza o nombre
          </label>
          <input
            id="lector"
            ref={campo}
            data-caja="lector"
            value={entrada}
            onChange={(ev) => setEntrada(ev.target.value)}
            disabled={bloqueado}
            autoComplete="off"
            inputMode="text"
            enterKeyHint="enter"
            placeholder="Pasá el lector o escribí"
            className="h-14 min-w-0 flex-1 rounded-md border-2 border-accent bg-surface-raised px-3 font-mono text-lg text-strong placeholder:text-faint focus-visible:outline-2 focus-visible:outline-focus"
          />
          <Button type="submit" size="lg" disabled={bloqueado} className="h-14">
            Agregar
          </Button>
        </form>

        {multiplicador !== null && (
          <p className="flex items-center gap-2 text-sm text-body">
            <span className="rounded-md bg-accent-soft px-2 py-1 font-semibold text-strong">Próximo: {multiplicador} ×</span>
            <button type="button" className="inline-flex min-h-11 items-center underline" onClick={() => setMultiplicador(null)}>
              Quitar
            </button>
          </p>
        )}
        <p role={mensaje?.tono === "error" ? "alert" : "status"} aria-live="polite" className={cn("min-h-6 text-sm", mensaje?.tono === "error" ? "font-medium text-danger" : "text-muted")}>
          {mensaje?.texto ?? ""}
        </p>

        {sugerencias.length > 0 && (
          <ul aria-label="Productos encontrados" className="divide-y divide-line rounded-md border border-line bg-surface-raised">
            {sugerencias.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => elegirSugerencia(p)} className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent-soft">
                  <span className="min-w-0 text-sm text-strong">{p.name}</span>
                  <span className="shrink-0 text-sm tabular-nums text-body">
                    {fmtMoneyARS((p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) ?? 0)}
                    {p.saleUnit === "WEIGHT" ? " el kg" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {pesando && (
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              confirmarPeso();
            }}
            className="rounded-md border border-line bg-surface-raised p-3"
          >
            <label htmlFor="peso" className="text-sm font-medium text-strong">
              ¿Cuánto pesa «{pesando.producto.name}»? (kg)
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="peso"
                autoFocus
                inputMode="decimal"
                value={pesando.texto}
                onChange={(ev) => setPesando({ ...pesando, texto: ev.target.value })}
                placeholder="0,350"
                className="h-11 w-32 rounded-md border border-line-strong bg-surface-raised px-3 text-strong"
              />
              <Button type="submit">Agregar</Button>
              <Button type="button" variant="ghost" onClick={() => { setPesando(null); volverAlCampo(); }}>
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {ticket.length === 0 && !cobrada && (
          <div className="rounded-md border border-dashed border-line-strong p-6 text-center text-sm text-muted">
            El ticket está vacío. Pasá el primer producto por el lector.
          </div>
        )}

        {ticket.length > 0 && (
          <ol aria-label="Renglones del ticket" data-caja="ticket" className="divide-y divide-line rounded-md border border-line bg-surface-raised">
            {ticket.map((r) => {
              const promo = promoDe.get(r.clave);
              const bruto = importeDelRenglon(r);
              return (
                <li key={r.clave} data-caja="renglon" className={cn("flex items-start gap-3 px-3 py-2", ultimo === r.clave && "bg-accent-soft/60")}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-strong">{r.nombre}</p>
                    <p className="text-xs text-muted">
                      {r.saleUnit === "WEIGHT"
                        ? `${formatearCantidad(r.cantidad)} kg × ${fmtMoneyARS(r.precio)}/kg${r.porBalanza ? " · balanza" : ""}`
                        : `${r.cantidad} × ${fmtMoneyARS(r.precio)}`}
                    </p>
                    {promo && promo.descuento > 0 && (
                      <p className="text-xs font-medium text-success">
                        {promo.promos.join(" + ")}: −{fmtMoneyARS(promo.descuento)}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm tabular-nums text-strong">{fmtMoneyARS(promo ? promo.neto : bruto)}</p>
                    {promo && promo.descuento > 0 && <p className="text-xs tabular-nums text-muted line-through">{fmtMoneyARS(bruto)}</p>}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={bloqueado}
                    aria-label={`Anular ${r.nombre}`}
                    onClick={() => setAnulando({ renglon: r, email: "", clave: "", error: null, enviando: false })}
                  >
                    Anular
                  </Button>
                </li>
              );
            })}
          </ol>
        )}

        {cobrada && (
          <div role="status" data-caja="cobrada" className="space-y-3 rounded-md border border-success/40 bg-success-soft/30 p-3">
            <p className="text-base font-semibold text-strong">
              Venta #{cobrada.venta.code} cobrada: {fmtMoneyARS(cobrada.venta.total)}
              {cobrada.vuelto > 0 ? ` · Vuelto ${fmtMoneyARS(cobrada.vuelto)}` : ""}
            </p>
            <TicketVenta venta={cobrada.venta} negocio={negocio} pagoCon={cobrada.pagoCon} />
          </div>
        )}
      </section>

      <aside aria-label="Cobro" className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-md border border-line bg-surface-raised p-4">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">{vista.unidades} {vista.unidades === 1 ? "producto" : "productos"}</dt>
              <dd className="tabular-nums text-body">{fmtMoneyARS(vista.bruto)}</dd>
            </div>
            {vista.ahorro > 0 && (
              <div className="flex justify-between font-medium text-success">
                <dt>Promos</dt>
                <dd className="tabular-nums">−{fmtMoneyARS(vista.ahorro)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-line pt-2">
              <dt className="text-base font-semibold text-strong">Total</dt>
              <dd data-caja="total" className="text-3xl font-bold tabular-nums text-strong">{fmtMoneyARS(vista.total)}</dd>
            </div>
          </dl>
        </div>

        <fieldset className="min-w-0 space-y-3 rounded-md border border-line bg-surface-raised p-4" disabled={bloqueado}>
          <legend className="px-1 text-sm font-semibold text-strong">Cómo paga</legend>
          {pagos.map((p, i) => (
            <div key={i} className="space-y-2">
              <div role="radiogroup" aria-label={`Medio ${i + 1}`} className="grid grid-cols-3 gap-1">
                {MEDIOS_DE_COBRO.map((m) => (
                  <button
                    key={m.valor}
                    type="button"
                    role="radio"
                    aria-checked={p.medio === m.valor}
                    onClick={() => cambiarMedio(i, m.valor)}
                    className={cn(
                      "min-h-11 rounded-md border px-1 text-xs font-medium",
                      p.medio === m.valor ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-surface-raised text-strong",
                    )}
                  >
                    {m.etiqueta}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor={`monto-${i}`} className="w-28 text-xs text-muted">
                  {p.medio === "EFECTIVO" ? "Paga con" : "Monto"}
                  {leidos[i] === null && vacios === 1 && " (vacío: lo que falta)"}
                </label>
                <input
                  id={`monto-${i}`}
                  data-caja={`monto-${i}`}
                  inputMode="decimal"
                  value={p.montoTexto}
                  onChange={(ev) => setPagos(pagos.map((x, k) => (k === i ? { ...x, montoTexto: ev.target.value } : x)))}
                  placeholder={vacios === 1 && leidos[i] === null ? fmtMoneyARS(falta) : "0"}
                  className="h-11 min-w-0 flex-1 rounded-md border border-line-strong bg-surface-raised px-3 text-right tabular-nums text-strong"
                />
                {pagos.length > 1 && (
                  <button type="button" onClick={() => setPagos(pagos.filter((_, k) => k !== i))} className="min-h-11 px-2 text-xs underline" aria-label={`Sacar ${etiquetaDeMedio(p.medio)}`}>
                    Sacar
                  </button>
                )}
              </div>
            </div>
          ))}
          {pagos.length < 3 && (
            <button
              type="button"
              data-caja="otro-medio"
              onClick={() => {
                const usado = new Set(pagos.map((p) => p.medio));
                const libre = MEDIOS_DE_COBRO.find((m) => !usado.has(m.valor))?.valor ?? "MERCADOPAGO";
                setPagos([...pagos, { medio: libre, montoTexto: "" }]);
              }}
              className="min-h-11 text-sm font-medium text-accent-ink underline"
            >
              + Pagar con otro medio
            </button>
          )}
          {reparto && !reparto.ok && <p className="text-sm text-danger">{reparto.error}</p>}
          {reparto?.ok && reparto.vuelto > 0 && (
            <p data-caja="vuelto" className="text-base font-semibold text-strong">
              Vuelto: {fmtMoneyARS(reparto.vuelto)}
            </p>
          )}
        </fieldset>

        {sinConfirmar ? (
          <div role="alert" className="space-y-2 rounded-md border border-warning/40 bg-warning-soft/40 p-3 text-sm">
            <p>{sinConfirmar}</p>
            <Button type="button" onClick={cobrar} disabled={cobrando} className="w-full">
              Reintentar el cobro
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="lg"
            data-caja="cobrar"
            className="w-full"
            disabled={bloqueado || ticket.length === 0 || !reparto?.ok}
            onClick={cobrar}
          >
            {cobrando ? "Cobrando…" : `Cobrar ${fmtMoneyARS(vista.total)}`}
          </Button>
        )}
        <p className="text-xs text-muted">Cobra: {cajero}. Las promos se aplican solas; el ticket dice cuáles.</p>
      </aside>

      {anulando && (
        <div role="dialog" aria-modal="true" aria-labelledby="titulo-anular" className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              void confirmarAnulacion();
            }}
            className="w-full max-w-md space-y-3 rounded-lg bg-surface-raised p-4 shadow-lg"
          >
            <h2 id="titulo-anular" className="text-base font-semibold text-strong">
              Anular «{anulando.renglon.nombre}»
            </h2>
            <p className="text-sm text-body">
              {fmtMoneyARS(importeDelRenglon(anulando.renglon))}. Queda registrado quién cobraba y quién autorizó.
            </p>
            {!anulaSolo && (
              <>
                <p className="text-sm text-body">Tiene que autorizar el encargado o el dueño con su mail y su clave.</p>
                <label className="block text-sm">
                  <span className="text-muted">Mail del encargado</span>
                  <input
                    type="email"
                    autoFocus
                    value={anulando.email}
                    onChange={(ev) => setAnulando({ ...anulando, email: ev.target.value })}
                    className="mt-1 h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-strong"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-muted">Clave</span>
                  <input
                    type="password"
                    value={anulando.clave}
                    onChange={(ev) => setAnulando({ ...anulando, clave: ev.target.value })}
                    className="mt-1 h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-strong"
                  />
                </label>
              </>
            )}
            {anulando.error && (
              <p role="alert" className="text-sm font-medium text-danger">
                {anulando.error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" variant="danger" disabled={anulando.enviando}>
                {anulando.enviando ? "Anulando…" : "Anular el renglón"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setAnulando(null); volverAlCampo(); }}>
                Volver
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
