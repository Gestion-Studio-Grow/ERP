"use client";

// ============================================================================
// FACTURADOR GUIADO — emitir un comprobante en tres pasos: a quién · qué · confirmar
// ============================================================================
//
// El MISMO componente para el panel de cualquier negocio, la consola del contador y Factoque. Cada
// pantalla le pasa su acción de emitir (con su barrera en el servidor) y sus rutas de ayuda; lo
// propio de cada una (los atajos y la emisión en serie del contador, «Mis productos» de Factoque)
// va por fuera, como capa, o por las props `atajosDeTeclado` / `despues`.
//
// Por defecto arranca en «Qué» con el consumidor final elegido: lo de todos los días son dos pasos
// (qué y confirmar). Antes de emitir muestra qué comprobante sale, el neto, el IVA y el total, con la
// MISMA validación y la MISMA cuenta del servidor (facturador-core). Si algo falla, lo dice en
// criollo y ofrece la acción que lo resuelve. Los últimos compradores y detalles se recuerdan en el
// dispositivo (nunca en el servidor), por negocio.

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { Badge, Button, Chip, Field, Input, Kbd, Segmented, Select, buttonClasses, fmtMoneyARS } from "@/components/ui";
import {
  OPCIONES_ALICUOTA,
  OPCIONES_CONCEPTO,
  OPCIONES_CONDICION_RECEPTOR,
  avisoCuitJuridicoMonotributo,
  conceptoConFechasDeServicio,
  fechaFiscalAInput,
  validarEmision,
  type AlicuotaFacturita,
  type ConceptoFacturita,
  type CondicionReceptorConCuit,
  type EmisionFacturita,
} from "@/lib/facturita-core";
import { nuevaClaveEmision } from "@/lib/facturita-atajos";
import {
  CONSUMIDOR_FINAL,
  PASOS,
  borradorVacio,
  explicarError,
  faltaEnComprador,
  faltaEnQue,
  leerRecientes,
  nombreDelComprador,
  pedidoDelBorrador,
  pideDomicilio,
  previa,
  sumarReciente,
  type Borrador,
  type Comprador,
  type ErrorExplicado,
  type Paso,
  type ResultadoEmisionManual,
  type RutasDeAyuda,
} from "@/lib/facturacion/facturador-core";

type Identificado = Extract<Comprador, { tipo: "identificado" }>;
type ItemReciente = { descripcion: string; total: string; concepto: ConceptoFacturita };

const SELECT = "h-11 w-full";
const DOCS: { valor: "80" | "86" | "96"; etiqueta: string }[] = [
  { valor: "80", etiqueta: "CUIT" },
  { valor: "86", etiqueta: "CUIL" },
  { valor: "96", etiqueta: "DNI" },
];

function leer(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}
const EVENTO = "gsg-facturador";
function guardar(clave: string, valor: unknown) {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor));
    window.dispatchEvent(new Event(EVENTO));
  } catch {
    // Sin almacenamiento (modo privado): el facturador anda igual, sin recordar.
  }
}
/** El almacenamiento del dispositivo como fuente externa: en el servidor, vacío. */
function suscribir(aviso: () => void) {
  window.addEventListener(EVENTO, aviso);
  window.addEventListener("storage", aviso);
  return () => {
    window.removeEventListener(EVENTO, aviso);
    window.removeEventListener("storage", aviso);
  };
}
function leerItems(crudo: string | null): ItemReciente[] {
  try {
    const v = JSON.parse(crudo ?? "[]") as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is ItemReciente => !!x && typeof x.descripcion === "string" && typeof x.total === "string")
      .map((x) => ({
        descripcion: x.descripcion.slice(0, 200),
        total: x.total.slice(0, 20),
        concepto: OPCIONES_CONCEPTO.some((o) => o.id === x.concepto) ? x.concepto : "productos",
      }))
      .slice(0, 5);
  } catch {
    return [];
  }
}

export interface FacturadorGuiadoProps {
  /** La acción de emitir de ESTA pantalla (cada una con su barrera en el servidor). */
  emitir: (datos: EmisionFacturita) => Promise<ResultadoEmisionManual>;
  /** Condición del EMISOR frente al IVA; `null` = sin perfil fiscal (no se emite). */
  condicionEmisor: string | null;
  /** Fecha fiscal de hoy (AAAAMMDD), la del comprobante. */
  hoy: string;
  /** Para recordar los últimos compradores por negocio (p. ej. el id del negocio que emite). */
  ambito: string;
  rutas: RutasDeAyuda;
  /** Con el tope del plan agotado (Factoque) o sin facturación: no deja emitir. */
  bloqueado?: { motivo: string } | null;
  /** Un borrador precargado (un producto de Factoque que pide más datos). */
  inicial?: Partial<Borrador> | null;
  /** Atajos de teclado (la consola del contador): Ctrl+Enter avanza o emite; Alt+1/2/3 va al paso. */
  atajosDeTeclado?: boolean;
  /** Para el enlace «Ver el comprobante» del resultado. */
  enlaceDelComprobante?: (invoiceId: string) => string;
  /** Lo propio de cada pantalla debajo del resultado (p. ej. «Ir al lote del mes»). */
  despues?: React.ReactNode;
  /** Avisa que salió una (la capa refresca su lista). */
  alEmitir?: (r: Extract<ResultadoEmisionManual, { ok: true }>) => void;
}

export default function FacturadorGuiado({
  emitir,
  condicionEmisor,
  hoy,
  ambito,
  rutas,
  bloqueado = null,
  inicial = null,
  atajosDeTeclado = false,
  enlaceDelComprobante,
  despues,
  alEmitir,
}: FacturadorGuiadoProps) {
  const id = useId();
  const [b, setB] = useState<Borrador>(() => ({ ...borradorVacio(), ...inicial }));
  // Lo de todos los días: consumidor final ya elegido, se arranca por «Qué».
  const [paso, setPaso] = useState<Paso>(2);
  const [resultado, setResultado] = useState<ResultadoEmisionManual | null>(null);
  const [pendiente, startTransition] = useTransition();
  const clave = useRef<{ firma: string; valor: string } | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const kCompradores = `gsg:facturador:${ambito}:compradores`;
  const kItems = `gsg:facturador:${ambito}:items`;

  const crudoCompradores = useSyncExternalStore(suscribir, () => leer(kCompradores) ?? "", () => "");
  const crudoItems = useSyncExternalStore(suscribir, () => leer(kItems) ?? "", () => "");
  const recientes = useMemo(() => leerRecientes(crudoCompradores || null), [crudoCompradores]);
  const items = useMemo(() => leerItems(crudoItems || null), [crudoItems]);

  const inscripto = condicionEmisor === "RESPONSABLE_INSCRIPTO";
  const faltaComprador = faltaEnComprador(b.comprador, condicionEmisor);
  const faltaQue = faltaEnQue(b);
  const vista = previa(b, condicionEmisor);
  const pedido = pedidoDelBorrador(b, condicionEmisor);
  // La MISMA validación que el servidor, antes de tocar «Emitir» (p. ej. el umbral de RG 5700).
  const validacion = faltaComprador || faltaQue ? null : validarEmision(pedido, hoy, { condicionEmisor });
  const errorPrevio: ErrorExplicado | null =
    condicionEmisor === null
      ? explicarError("Faltan los datos fiscales del negocio (CUIT y punto de venta).", rutas)
      : validacion && !validacion.ok
        ? explicarError(validacion.error, rutas)
        : null;
  const nombreComprobante = vista?.letra ? `Factura ${vista.letra}` : "Factura";

  const irA = useCallback((p: Paso) => {
    setPaso(p);
    setResultado(null);
    requestAnimationFrame(() => titulo.current?.focus({ preventScroll: false }));
  }, []);

  const cambiar = (parcial: Partial<Borrador>) => {
    setB((v) => ({ ...v, ...parcial }));
    if (resultado && !resultado.ok) setResultado(null);
  };
  const cambiarComprador = (parcial: Partial<Identificado>) =>
    setB((v) => {
      const actual: Identificado =
        v.comprador.tipo === "identificado"
          ? v.comprador
          : { tipo: "identificado", docTipo: 80, docNro: "", nombre: "", condicion: "", domicilio: "" };
      return { ...v, comprador: { ...actual, ...parcial } };
    });

  const enviar = useCallback(() => {
    if (pendiente || bloqueado || !validacion?.ok) return;
    setResultado(null);
    // La misma clave sólo para el MISMO pedido: si la persona cambió algo, es otra factura.
    const firma = JSON.stringify(pedido);
    if (clave.current?.firma !== firma) clave.current = { firma, valor: nuevaClaveEmision() };
    const claveEmision = clave.current.valor;
    startTransition(async () => {
      let r: ResultadoEmisionManual;
      try {
        r = await emitir({ ...pedido, claveEmision });
      } catch {
        r = { ok: false, error: "No se pudo emitir la factura. Probá de nuevo en unos minutos." };
      }
      // Con factura (emitida o rechazada) la próxima es otro intento. Sin factura conocida, la clave
      // se conserva: si el error fue después de grabarla, reintentar devuelve esa y no pide otro CAE.
      if (r.ok || r.invoiceId) clave.current = null;
      setResultado(r);
      if (r.ok) {
        guardar(kCompradores, sumarReciente(recientes, b.comprador));
        const item: ItemReciente = { descripcion: b.descripcion.trim(), total: b.total.trim(), concepto: b.concepto };
        guardar(kItems, [item, ...items.filter((x) => x.descripcion !== item.descripcion)].slice(0, 5));
        alEmitir?.(r);
      }
      requestAnimationFrame(() => document.getElementById(`${id}-resultado`)?.focus());
    });
  }, [pendiente, bloqueado, validacion, pedido, emitir, recientes, b, items, kCompradores, kItems, alEmitir, id]);

  /** «Emitir otra»: de nuevo a «Qué»; con `mismoComprador`, el comprador queda. */
  const otra = (mismoComprador: boolean) => {
    setB((v) => ({ ...borradorVacio(), comprador: mismoComprador ? v.comprador : CONSUMIDOR_FINAL, alicuota: v.alicuota }));
    clave.current = null;
    irA(2);
    requestAnimationFrame(() => document.getElementById(`${id}-detalle`)?.focus());
  };

  const avanzar = useCallback(() => {
    if (paso === 1 && !faltaComprador) irA(2);
    else if (paso === 2 && !faltaQue) irA(3);
    else if (paso === 3) enviar();
  }, [paso, faltaComprador, faltaQue, irA, enviar]);

  // La versión al día de `otra` para el atajo (sin volver a enganchar el teclado en cada letra).
  const otraRef = useRef(otra);
  useEffect(() => {
    otraRef.current = otra;
  });
  useEffect(() => {
    if (!atajosDeTeclado) return;
    const alTeclear = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (resultado?.ok) otraRef.current(false);
        else avanzar();
      } else if (e.altKey && ["1", "2", "3"].includes(e.key)) {
        e.preventDefault();
        irA(Number(e.key) as Paso);
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [atajosDeTeclado, avanzar, irA, resultado]);
  const errorDelServidor = resultado && !resultado.ok ? explicarError(resultado.error, rutas) : null;
  const comprador = b.comprador;

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex min-w-0 flex-col gap-4">
      {/* Los tres pasos: se puede volver a uno anterior tocándolo. */}
      <ol aria-label="Pasos para emitir" className="m-0 flex list-none gap-1 p-0">
        {PASOS.map((p) => {
          const actual = p.paso === paso && !resultado?.ok;
          const hecho = p.paso < paso || resultado?.ok;
          return (
            <li key={p.paso} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => irA(p.paso)}
                disabled={pendiente || (p.paso === 3 && (!!faltaComprador || !!faltaQue))}
                aria-current={actual ? "step" : undefined}
                className={`flex min-h-11 w-full flex-col items-start rounded-md border-b-2 px-2 py-1 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed ${
                  actual ? "border-accent font-semibold text-strong" : hecho ? "border-line-strong text-body" : "border-line text-muted"
                }`}
              >
                <span className="text-xs tabular-nums text-muted">Paso {p.paso}</span>
                <span className="truncate">{p.nombre}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {bloqueado && (
        <p role="alert" className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm font-medium text-strong">
          {bloqueado.motivo}
        </p>
      )}

      {/* El comprador elegido, siempre a la vista fuera del paso 1: cambiarlo es un toque. */}
      {paso !== 1 && !resultado?.ok && (
        <p className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface-sunken px-3 text-sm">
          <span className="text-muted">A:</span>
          <span className="min-w-0 font-medium text-strong [overflow-wrap:anywhere]">{nombreDelComprador(comprador)}</span>
          <button type="button" onClick={() => irA(1)} className="ml-auto min-h-11 font-medium text-accent-ink underline underline-offset-4">
            Cambiar
          </button>
        </p>
      )}

      <h2 id={`${id}-titulo`} ref={titulo} tabIndex={-1} className="text-base font-semibold text-strong focus:outline-none">
        {resultado?.ok ? "Listo" : paso === 1 ? "¿A quién le facturás?" : paso === 2 ? "¿Qué vendiste?" : `Revisá y emití la ${nombreComprobante}`}
      </h2>

      {/* ───────────── Paso 1 · A quién ───────────── */}
      {paso === 1 && !resultado?.ok && (
        <div className="flex flex-col gap-4">
          <div role="group" aria-label="Compradores" className="flex flex-wrap gap-2">
            <Chip
              prendido={comprador.tipo === "consumidor-final"}
              onClick={() => {
                cambiar({ comprador: CONSUMIDOR_FINAL });
                irA(2);
              }}
            >
              Consumidor final
            </Chip>
            {recientes.map((r) => (
              <Chip
                key={`${r.docTipo}:${r.docNro}`}
                prendido={comprador.tipo === "identificado" && comprador.docNro === r.docNro && comprador.docTipo === r.docTipo}
                onClick={() => {
                  cambiar({ comprador: r });
                  if (!faltaEnComprador(r, condicionEmisor)) irA(2);
                }}
              >
                <span className="max-w-48 truncate">{r.nombre}</span>
              </Chip>
            ))}
            <Chip
              prendido={comprador.tipo === "identificado" && !recientes.some((r) => r.docNro === comprador.docNro)}
              onClick={() => cambiarComprador({ docNro: "", nombre: "", condicion: "", domicilio: "" })}
            >
              Otro, con CUIT, CUIL o DNI
            </Chip>
          </div>

          {comprador.tipo === "identificado" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Segmented
                name={`${id}-doc`}
                leyenda="Documento"
                leyendaVisible
                opciones={DOCS}
                value={String(comprador.docTipo)}
                onChange={(e) =>
                  cambiarComprador({ docTipo: Number((e.target as unknown as HTMLInputElement).value) as 80 | 86 | 96 })
                }
                lleno
              />
              <Field
                label="Número"
                htmlFor={`${id}-docnro`}
                hint={comprador.docTipo === 96 ? "7 u 8 números." : "11 números, con o sin guiones."}
              >
                <Input
                  id={`${id}-docnro`}
                  inputMode="numeric"
                  autoComplete="off"
                  value={comprador.docNro}
                  onChange={(e) => cambiarComprador({ docNro: e.target.value })}
                />
              </Field>
              <Field label="Nombre o razón social" htmlFor={`${id}-nombre`} hint="Va impreso en la factura." required>
                <Input
                  id={`${id}-nombre`}
                  maxLength={120}
                  autoComplete="off"
                  value={comprador.nombre}
                  onChange={(e) => cambiarComprador({ nombre: e.target.value })}
                />
              </Field>
              {comprador.docTipo === 80 && (
                <Field
                  label="¿Cómo está inscripto?"
                  htmlFor={`${id}-condicion`}
                  hint="Figura en su constancia de ARCA. De esto depende la letra."
                  required
                >
                  <Select
                    id={`${id}-condicion`}
                    className={SELECT}
                    value={comprador.condicion}
                    onChange={(e) => cambiarComprador({ condicion: e.target.value as CondicionReceptorConCuit | "" })}
                  >
                    <option value="">Elegí una opción</option>
                    {OPCIONES_CONDICION_RECEPTOR.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nombre}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {comprador.docTipo === 80 && (
                <Field
                  label={pideDomicilio(comprador, condicionEmisor) ? "Domicilio" : "Domicilio (opcional)"}
                  htmlFor={`${id}-domicilio`}
                  hint={pideDomicilio(comprador, condicionEmisor) ? "Le corresponde Factura A, y la A lo lleva impreso." : undefined}
                  required={pideDomicilio(comprador, condicionEmisor)}
                >
                  <Input
                    id={`${id}-domicilio`}
                    maxLength={200}
                    autoComplete="off"
                    value={comprador.domicilio}
                    onChange={(e) => cambiarComprador({ domicilio: e.target.value })}
                  />
                </Field>
              )}
              {comprador.docTipo === 80 && avisoCuitJuridicoMonotributo(comprador.docNro, comprador.condicion) && (
                <p role="note" className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm text-strong sm:col-span-2">
                  {avisoCuitJuridicoMonotributo(comprador.docNro, comprador.condicion)}
                </p>
              )}
            </div>
          )}

          <Pie falta={faltaComprador} atajos={atajosDeTeclado}>
            <Button onClick={() => irA(2)} disabled={!!faltaComprador}>
              Seguir
            </Button>
          </Pie>
        </div>
      )}

      {/* ───────────── Paso 2 · Qué ───────────── */}
      {paso === 2 && !resultado?.ok && (
        <div className="flex flex-col gap-4">
          <Segmented
            name={`${id}-concepto`}
            leyenda="Vendiste"
            leyendaVisible
            opciones={OPCIONES_CONCEPTO.map((o) => ({ valor: o.id, etiqueta: o.nombre }))}
            value={b.concepto}
            onChange={(e) => cambiar({ concepto: (e.target as unknown as HTMLInputElement).value as ConceptoFacturita })}
            lleno
          />
          {items.length > 0 && (
            <div role="group" aria-label="Lo último que facturaste" className="flex flex-wrap gap-2">
              {items.map((it) => (
                <Chip key={it.descripcion} onClick={() => cambiar({ descripcion: it.descripcion, total: it.total, concepto: it.concepto })}>
                  <span className="max-w-40 truncate">{it.descripcion}</span>
                  <span className="tabular-nums text-muted">{it.total}</span>
                </Chip>
              ))}
            </div>
          )}
          <Field label="Detalle" htmlFor={`${id}-detalle`} hint="Contalo simple: va en la factura." required>
            <Input
              id={`${id}-detalle`}
              maxLength={200}
              value={b.descripcion}
              placeholder={OPCIONES_CONCEPTO.find((o) => o.id === b.concepto)?.ejemplo}
              onChange={(e) => cambiar({ descripcion: e.target.value })}
            />
          </Field>
          <div className={inscripto ? "grid gap-4 sm:grid-cols-2" : ""}>
            <Field label="Total" htmlFor={`${id}-total`} hint={inscripto ? "En pesos, con el IVA incluido." : "En pesos."} required>
              <Input
                id={`${id}-total`}
                inputMode="decimal"
                autoComplete="off"
                value={b.total}
                placeholder="Ej.: 25.000"
                onChange={(e) => cambiar({ total: e.target.value })}
              />
            </Field>
            {inscripto && (
              <Field label="Alícuota de IVA" htmlFor={`${id}-alicuota`} hint="Si no sabés, casi siempre es la general.">
                <Select
                  id={`${id}-alicuota`}
                  className={SELECT}
                  value={b.alicuota}
                  onChange={(e) => cambiar({ alicuota: e.target.value as AlicuotaFacturita })}
                >
                  {OPCIONES_ALICUOTA.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          {conceptoConFechasDeServicio(b.concepto) && (
            <fieldset className="grid gap-4 rounded-lg border border-line p-4 sm:grid-cols-3">
              <legend className="px-1 text-sm font-medium text-strong">Fechas que pide ARCA para un servicio</legend>
              <Field label="Desde" htmlFor={`${id}-desde`} required>
                <Input id={`${id}-desde`} type="date" value={b.desde} onChange={(e) => cambiar({ desde: e.target.value })} />
              </Field>
              <Field label="Hasta" htmlFor={`${id}-hasta`} required>
                <Input id={`${id}-hasta`} type="date" value={b.hasta} min={b.desde || undefined} onChange={(e) => cambiar({ hasta: e.target.value })} />
              </Field>
              <Field label="Te lo pagan hasta el" htmlFor={`${id}-vto`} hint="Si ya te pagaron, poné hoy." required>
                <Input
                  id={`${id}-vto`}
                  type="date"
                  value={b.vencimiento}
                  min={fechaFiscalAInput(hoy)}
                  onChange={(e) => cambiar({ vencimiento: e.target.value })}
                />
              </Field>
            </fieldset>
          )}
          <Pie falta={faltaQue} atajos={atajosDeTeclado}>
            <Button onClick={() => irA(3)} disabled={!!faltaQue}>
              {vista ? `Revisar · ${fmtMoneyARS(vista.total)}` : "Revisar"}
            </Button>
          </Pie>
        </div>
      )}

      {/* ───────────── Paso 3 · Confirmar ───────────── */}
      {paso === 3 && !resultado?.ok && (
        <div className="flex flex-col gap-4">
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-line bg-surface-raised p-4 text-sm">
            <dt className="text-muted">Comprobante</dt>
            <dd className="m-0 font-semibold text-strong">{nombreComprobante}</dd>
            <dt className="text-muted">A</dt>
            <dd className="m-0 min-w-0 text-strong [overflow-wrap:anywhere]">{nombreDelComprador(comprador)}</dd>
            <dt className="text-muted">Detalle</dt>
            <dd className="m-0 min-w-0 text-strong [overflow-wrap:anywhere]">{b.descripcion.trim()}</dd>
            {vista?.discrimina && (
              <>
                <dt className="text-muted">Neto</dt>
                <dd className="m-0 text-right tabular-nums text-strong">{fmtMoneyARS(vista.neto)}</dd>
                <dt className="text-muted">IVA {OPCIONES_ALICUOTA.find((o) => o.id === b.alicuota)?.nombre}</dt>
                <dd className="m-0 text-right tabular-nums text-strong">{fmtMoneyARS(vista.iva)}</dd>
              </>
            )}
            <dt className="border-t border-line pt-2 font-semibold text-strong">Total</dt>
            <dd className="m-0 border-t border-line pt-2 text-right text-xl font-bold tabular-nums text-strong">
              {vista ? fmtMoneyARS(vista.total) : "—"}
            </dd>
          </dl>
          <p className="text-xs text-muted">
            La letra la confirma el sistema con tus datos y los del comprador. Al emitir, va a ARCA para su autorización.
          </p>
          {errorPrevio && <ErrorConAccion error={errorPrevio} irA={irA} reintentar={enviar} />}
          <Pie falta={null} atajos={atajosDeTeclado}>
            <Button
              onClick={enviar}
              disabled={pendiente || !!bloqueado || !validacion?.ok}
              estado={pendiente ? "cargando" : undefined}
              className="w-full sm:w-auto"
            >
              {pendiente ? "Emitiendo…" : vista ? `Emitir ${nombreComprobante} por ${fmtMoneyARS(vista.total)}` : "Emitir"}
            </Button>
          </Pie>
        </div>
      )}

      {/* ───────────── Resultado ───────────── */}
      <div id={`${id}-resultado`} tabIndex={-1} aria-live="polite" className="focus:outline-none">
        {errorDelServidor && <ErrorConAccion error={errorDelServidor} irA={irA} reintentar={enviar} />}
        {resultado?.ok && (
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4">
            <div className="flex flex-wrap items-center gap-2">
              {resultado.estado.estado === "autorizada" ? (
                resultado.estado.dePrueba ? (
                  <Badge tone="warning" dot>Autorizada de prueba</Badge>
                ) : (
                  <Badge tone="success" dot>Autorizada por ARCA</Badge>
                )
              ) : (
                <Badge tone="neutral" dot>Pendiente</Badge>
              )}
              <span className="text-sm text-body">{resultado.mensaje}</span>
            </div>
            {resultado.limite?.mensaje && <span className="text-sm text-muted">{resultado.limite.mensaje}</span>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => otra(false)} disabled={!!bloqueado}>
                Emitir otra
              </Button>
              {comprador.tipo === "identificado" && (
                <Button variant="outline" onClick={() => otra(true)} disabled={!!bloqueado}>
                  Otra a {comprador.nombre.trim().split(/\s+/).slice(0, 3).join(" ")}
                </Button>
              )}
              {enlaceDelComprobante && (
                <Link href={enlaceDelComprobante(resultado.invoiceId)} className={buttonClasses("ghost")}>
                  Ver el comprobante
                </Link>
              )}
            </div>
            {atajosDeTeclado && (
              <p className="text-xs text-muted">
                <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> para la próxima.
              </p>
            )}
            {despues}
          </div>
        )}
      </div>
    </section>
  );
}

/** El botón del paso con lo que falta al lado, y la ayuda de teclado si la pantalla la tiene. */
function Pie({ falta, atajos, children }: { falta: string | null; atajos: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      {children}
      {falta ? (
        <p className="text-sm text-muted">{falta}</p>
      ) : (
        atajos && (
          <p className="hidden text-xs text-muted sm:block">
            <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd>
          </p>
        )
      )}
    </div>
  );
}

/** El error en criollo con el botón que lo resuelve (ir al paso, probar de nuevo o el enlace). */
function ErrorConAccion({ error, irA, reintentar }: { error: ErrorExplicado; irA: (p: Paso) => void; reintentar: () => void }) {
  const a = error.accion;
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-lg border border-danger bg-surface-raised px-3 py-3 text-sm sm:flex-row sm:items-center">
      <p className="m-0 flex-1 font-medium text-danger">{error.texto}</p>
      {a?.tipo === "paso" && (
        <Button variant="outline" size="sm" onClick={() => irA(a.paso)}>
          {a.etiqueta}
        </Button>
      )}
      {a?.tipo === "reintentar" && (
        <Button variant="outline" size="sm" onClick={reintentar}>
          {a.etiqueta}
        </Button>
      )}
      {a?.tipo === "enlace" && (
        <Link href={a.href} className={buttonClasses("outline", "sm")}>
          {a.etiqueta}
        </Link>
      )}
    </div>
  );
}
