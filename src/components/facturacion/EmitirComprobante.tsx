"use client";

// ============================================================================
// EMITIR COMPROBANTE — el facturador común, en UNA pantalla
// ============================================================================
//
// El MISMO componente para el panel de cualquier negocio, la consola del contador y Factoque. Cada
// pantalla le pasa su acción de emitir (con su barrera en el servidor) y sus rutas de ayuda; lo
// propio de cada una (los atajos y la emisión en serie del contador, «Mis productos» de Factoque)
// va por fuera, como capa, o por las props `atajosDeTeclado` / `despues`.
//
// docs/facturacion/ux-v2-diseno.md §1: dos preguntas («¿Cuánto cobraste?» y «¿Qué hiciste?», con los
// servicios del negocio como chips), el comprador plegado como «Consumidor final» (se despliega
// solo si el monto pide identificarlo), la letra la decide el sistema (`letraPrevista`), una previa
// de una línea y un único «Emitir». La MISMA validación y la MISMA cuenta del servidor
// (facturador-core / facturita-core). Si algo falla, lo dice en criollo (estados-ux.ts) con la
// acción que lo resuelve. Los últimos compradores y detalles se recuerdan en el dispositivo (nunca
// en el servidor), por negocio.

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { Button, Chip, Field, Input, Kbd, Segmented, Select, buttonClasses, fmtMoneyARS } from "@/components/ui";
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
  avisoDeFacturaA,
  enlaceDeWhatsApp,
  fechasDeServicioPorDefecto,
  mensajeDeWhatsApp,
  borradorVacio,
  faltaEnComprador,
  faltaEnQue,
  leerRecientes,
  pedidoDelBorrador,
  pideDomicilio,
  previa,
  sumarReciente,
  type Borrador,
  type Comprador,
  type ResultadoEmisionManual,
  type RutasDeAyuda,
} from "@/lib/facturacion/facturador-core";
import { estadoUx, sinJerga, type AccionUx, type EstadoUx } from "@/lib/facturacion/estados-ux";
import {
  alElegirServicio,
  pideIdentificarAlComprador,
  previaEnUnaLinea,
  type ServicioParaFacturar,
} from "@/lib/facturacion/facturador-una-pantalla";

type Identificado = Extract<Comprador, { tipo: "identificado" }>;
type ItemReciente = { descripcion: string; total: string; concepto: ConceptoFacturita };

const SELECT = "h-11 w-full";
const DOCS: { valor: "80" | "86" | "96"; etiqueta: string }[] = [
  { valor: "96", etiqueta: "DNI" },
  { valor: "80", etiqueta: "CUIT" },
  { valor: "86", etiqueta: "CUIL" },
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

export interface EmitirComprobanteProps {
  /** La acción de emitir de ESTA pantalla (cada una con su barrera en el servidor). */
  emitir: (datos: EmisionFacturita) => Promise<ResultadoEmisionManual>;
  /** Condición del EMISOR frente al IVA; `null` = sin perfil fiscal (no se emite). */
  condicionEmisor: string | null;
  /** Fecha fiscal de hoy (AAAAMMDD), la del comprobante. */
  hoy: string;
  /** Para recordar los últimos compradores por negocio (p. ej. el id del negocio que emite). */
  ambito: string;
  rutas: RutasDeAyuda;
  /**
   * Con el tope del plan agotado (Factoque) o sin facturación: no deja emitir. Se explica arriba,
   * con un título, qué pasa y la acción que lo destraba (p. ej. «Ver los planes»).
   */
  bloqueado?: { titulo?: string; motivo: string; accion?: { href: string; etiqueta: string } | null } | null;
  /**
   * La clase de Factura A del emisor inscripto. `null` = sin cargar: la A se avisa y no se emite
   * (ARCA la rechaza). Sin la prop, la pantalla no lo sabe y no avisa.
   */
  regimenFacturaA?: "A" | "A_CON_LEYENDA" | "M" | null;
  /**
   * El PDF del comprobante en el resultado. `faltanDatos`: lo que se le pide a la persona ANTES de
   * descargarlo (p. ej. su razón social y domicilio en Factoque), en vez de un PDF que no sale.
   */
  pdf?: { href: (invoiceId: string) => string; faltanDatos?: React.ReactNode | null } | null;
  /** «La misma, a otro comprador» en el resultado (la consola del contador). */
  cambiarReceptor?: boolean;
  /** Un borrador precargado (un producto de Factoque que pide más datos, un turno, una venta). */
  inicial?: Partial<Borrador> | null;
  /** Atajos de teclado (la consola del contador): Ctrl+Enter emite o la próxima; Alt+1 comprador, Alt+2 monto. */
  atajosDeTeclado?: boolean;
  /** Para el enlace «Ver detalle» del resultado. */
  enlaceDelComprobante?: (invoiceId: string) => string;
  /** Lo propio de cada pantalla debajo del resultado (p. ej. «Ir al lote del mes»). */
  despues?: React.ReactNode;
  /** Avisa que salió una (la capa refresca su lista). */
  alEmitir?: (r: Extract<ResultadoEmisionManual, { ok: true }>) => void;
  /** Los servicios del negocio, como chips de «¿Qué hiciste?». Sin ellos, texto libre. */
  servicios?: readonly ServicioParaFacturar[];
}

export default function EmitirComprobante({
  emitir,
  condicionEmisor,
  hoy,
  ambito,
  rutas,
  bloqueado = null,
  regimenFacturaA,
  pdf = null,
  cambiarReceptor = false,
  inicial = null,
  atajosDeTeclado = false,
  enlaceDelComprobante,
  despues,
  alEmitir,
  servicios = [],
}: EmitirComprobanteProps) {
  const id = useId();
  const [b, setB] = useState<Borrador>(() => {
    const base = { ...borradorVacio(), ...(servicios.length > 0 && !inicial?.concepto ? { concepto: "servicios" as const } : {}), ...inicial };
    return conceptoConFechasDeServicio(base.concepto) && !base.desde ? { ...base, ...fechasDeServicioPorDefecto(hoy) } : base;
  });
  const [compradorAbierto, setCompradorAbierto] = useState(() => inicial?.comprador?.tipo === "identificado");
  const [masDetalles, setMasDetalles] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEmisionManual | null>(null);
  const [pendiente, startTransition] = useTransition();
  const clave = useRef<{ firma: string; valor: string } | null>(null);
  const kCompradores = `gsg:facturador:${ambito}:compradores`;
  const kItems = `gsg:facturador:${ambito}:items`;

  const crudoCompradores = useSyncExternalStore(suscribir, () => leer(kCompradores) ?? "", () => "");
  const crudoItems = useSyncExternalStore(suscribir, () => leer(kItems) ?? "", () => "");
  const recientes = useMemo(() => leerRecientes(crudoCompradores || null), [crudoCompradores]);
  const items = useMemo(() => leerItems(crudoItems || null), [crudoItems]);

  const inscripto = condicionEmisor === "RESPONSABLE_INSCRIPTO";
  const comprador = b.comprador;
  const faltaComprador = faltaEnComprador(comprador, condicionEmisor);
  const faltaQue = faltaEnQue(b);
  const vista = previa(b, condicionEmisor);
  const pedido = pedidoDelBorrador(b, condicionEmisor);
  // La MISMA validación que el servidor, antes de tocar «Emitir» (p. ej. el umbral de identificación).
  const validacion = faltaComprador || faltaQue ? null : validarEmision(pedido, hoy, { condicionEmisor });
  const avisoA = avisoDeFacturaA(vista?.letra, regimenFacturaA);
  const ctx = { rutas, total: vista?.total ?? null, formatear: fmtMoneyARS };
  const fueRechazada = resultado?.ok && resultado.estado.estado === "rechazada";
  const exito = resultado?.ok && !fueRechazada ? resultado : null;

  // El monto que pide identificar al comprador despliega el bloque solo (una vez por error), y el
  // aviso queda a la vista mientras falten los datos del comprador.
  const pideIdentificar = !!validacion && !validacion.ok && pideIdentificarAlComprador(validacion.error);
  const [desplegadoPor, setDesplegadoPor] = useState<string | null>(null);
  if (pideIdentificar && validacion && !validacion.ok && desplegadoPor !== validacion.error) {
    setDesplegadoPor(validacion.error);
    setCompradorAbierto(true);
    if (b.comprador.tipo === "consumidor-final") {
      setB((v) => ({ ...v, comprador: { tipo: "identificado", docTipo: 96, docNro: "", nombre: "", condicion: "", domicilio: "" } }));
    }
  }
  // Con el comprador a medio cargar, el aviso del umbral sigue sólo si el monto todavía lo exige.
  const umbralVigente = (() => {
    if (!compradorAbierto || !faltaComprador || !desplegadoPor || faltaQue) return null;
    const v = validarEmision(pedidoDelBorrador({ ...b, comprador: CONSUMIDOR_FINAL }, condicionEmisor), hoy, { condicionEmisor });
    return !v.ok && pideIdentificarAlComprador(v.error) ? v.error : null;
  })();
  const errorVisible = validacion && !validacion.ok ? validacion.error : umbralVigente;

  // El estado en criollo que va arriba del botón (sólo uno: el más urgente).
  const estado: EstadoUx | null =
    condicionEmisor === null
      ? estadoUx({ tipo: "sin-configurar" }, ctx)
      : resultado && (!resultado.ok || fueRechazada)
        ? estadoUx({ tipo: "resultado", r: resultado }, ctx)
        : avisoA
          ? regimenFacturaA === null
            ? estadoUx({ tipo: "sin-regimen-a" }, ctx)
            : { clave: "sin-regimen-a", tono: "atencion", titulo: "Esta Factura A se hace desde ARCA", texto: sinJerga(avisoA), acciones: [{ id: "factura-b", etiqueta: "Hacer Factura B", principal: true }] }
          : errorVisible
            ? estadoUx({ tipo: "error", error: errorVisible }, ctx)
            : null;
  // Fechas de servicio con problema: «Más detalles» se abre solo.
  const errorDeFechas = faltaQue && /«Desde»|«Hasta»|te lo pagan/.test(faltaQue) ? faltaQue : null;
  const [abiertoPor, setAbiertoPor] = useState<string | null>(null);
  if (errorDeFechas && abiertoPor !== errorDeFechas) {
    setAbiertoPor(errorDeFechas);
    setMasDetalles(true);
  }

  const enfocar = (sufijo: string) => requestAnimationFrame(() => document.getElementById(`${id}-${sufijo}`)?.focus());

  const cambiar = (parcial: Partial<Borrador>) => {
    setB((v) => {
      const nuevo = { ...v, ...parcial };
      // Al pasar a servicios, las fechas arrancan con el mes en curso y el pago a 10 días (a la
      // vista en «Más detalles» para corregirlas).
      if (conceptoConFechasDeServicio(nuevo.concepto) && !nuevo.desde && !nuevo.hasta && !nuevo.vencimiento) {
        return { ...nuevo, ...fechasDeServicioPorDefecto(hoy) };
      }
      return nuevo;
    });
    if (resultado && (!resultado.ok || fueRechazada)) setResultado(null);
  };
  const cambiarComprador = (parcial: Partial<Identificado>) => {
    setB((v) => {
      const actual: Identificado =
        v.comprador.tipo === "identificado"
          ? v.comprador
          : { tipo: "identificado", docTipo: 96, docNro: "", nombre: "", condicion: "", domicilio: "" };
      return { ...v, comprador: { ...actual, ...parcial } };
    });
    if (resultado && (!resultado.ok || fueRechazada)) setResultado(null);
  };
  const aConsumidorFinal = () => {
    cambiar({ comprador: CONSUMIDOR_FINAL });
    setCompradorAbierto(false);
  };
  const abrirComprador = () => {
    setCompradorAbierto(true);
    if (comprador.tipo === "consumidor-final") cambiarComprador({});
    enfocar("docnro");
  };

  const enviar = useCallback(() => {
    if (pendiente || bloqueado || avisoA || !validacion?.ok) return;
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
        if (r.estado.estado !== "rechazada") {
          guardar(kCompradores, sumarReciente(recientes, b.comprador));
          const item: ItemReciente = { descripcion: b.descripcion.trim(), total: b.total.trim(), concepto: b.concepto };
          guardar(kItems, [item, ...items.filter((x) => x.descripcion !== item.descripcion)].slice(0, 5));
        }
        alEmitir?.(r);
      }
      // Con la factura hecha, el resultado a la vista; un error se anuncia en su lugar (role=alert).
      requestAnimationFrame(() => {
        const el = document.getElementById(r.ok && r.estado.estado !== "rechazada" ? `${id}-resultado` : `${id}-estado`);
        el?.focus({ preventScroll: true });
        el?.scrollIntoView({ block: "nearest" });
      });
    });
  }, [pendiente, bloqueado, avisoA, validacion, pedido, emitir, recientes, b, items, kCompradores, kItems, alEmitir, id]);

  /** «La misma, a otro comprador»: queda lo vendido, se abre el comprador. */
  const aOtroComprador = () => {
    setB((v) => ({ ...v, comprador: { tipo: "identificado", docTipo: 80, docNro: "", nombre: "", condicion: "", domicilio: "" } }));
    clave.current = null;
    setResultado(null);
    setCompradorAbierto(true);
    enfocar("docnro");
  };

  /** «Facturar otra»: el formulario de nuevo; con `mismoComprador`, el comprador queda. */
  const otra = (mismoComprador: boolean) => {
    setB((v) => ({
      ...borradorVacio(),
      ...(servicios.length > 0 ? { concepto: "servicios" as const, ...fechasDeServicioPorDefecto(hoy) } : {}),
      comprador: mismoComprador ? v.comprador : CONSUMIDOR_FINAL,
      alicuota: v.alicuota,
    }));
    if (!mismoComprador) setCompradorAbierto(false);
    clave.current = null;
    setResultado(null);
    enfocar("total");
  };

  const ejecutar = (a: AccionUx) => {
    if (a.id === "reintentar") enviar();
    else if (a.id === "factura-b") aConsumidorFinal();
    else if (a.id === "corregir-comprador") abrirComprador();
    else if (a.id === "corregir-detalle") {
      if (/fecha|servicio|vencimiento/i.test(estado?.texto ?? "")) setMasDetalles(true);
      enfocar("total");
    }
  };

  // La versión al día de los manejadores para el atajo (sin volver a enganchar el teclado en cada letra).
  const atajos = useRef({ otra, enviar, abrirComprador, exito: !!exito });
  useEffect(() => {
    atajos.current = { otra, enviar, abrirComprador, exito: !!exito };
  });
  useEffect(() => {
    if (!atajosDeTeclado) return;
    const alTeclear = (e: KeyboardEvent) => {
      const a = atajos.current;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (a.exito) a.otra(false);
        else a.enviar();
      } else if (e.altKey && e.key === "1") {
        e.preventDefault();
        a.abrirComprador();
      } else if (e.altKey && e.key === "2") {
        e.preventDefault();
        document.getElementById(`${id}-total`)?.focus();
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [atajosDeTeclado, id]);

  const linea = previaEnUnaLinea(vista, comprador, fmtMoneyARS);
  const falta = faltaQue ?? (compradorAbierto ? faltaComprador : null);

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex min-w-0 flex-col gap-5">
      {/* ───────────── Resultado (reemplaza al formulario: es lo único que importa) ───────────── */}
      <div id={`${id}-resultado`} tabIndex={-1} aria-live="polite" className="scroll-mt-20 focus:outline-none">
        {exito && (
          <ResultadoDeEmision r={exito} total={vista?.total ?? null} pdf={pdf} enlaceDelComprobante={enlaceDelComprobante} rutas={rutas}>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => otra(false)} disabled={!!bloqueado}>
                Facturar otra
              </Button>
              {comprador.tipo === "identificado" && (
                <Button variant="ghost" onClick={() => otra(true)} disabled={!!bloqueado}>
                  Otra a {comprador.nombre.trim().split(/\s+/).slice(0, 3).join(" ")}
                </Button>
              )}
              {cambiarReceptor && (
                <Button variant="ghost" onClick={aOtroComprador} disabled={!!bloqueado}>
                  La misma, a otro comprador
                </Button>
              )}
            </div>
            {atajosDeTeclado && (
              <p className="m-0 text-xs text-muted">
                <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> para la próxima.
              </p>
            )}
            {despues}
          </ResultadoDeEmision>
        )}
      </div>

      {!exito && (
        <>
          <h2 id={`${id}-titulo`} className="m-0 text-base font-semibold text-strong">
            Facturar
          </h2>

          {bloqueado && (
            <div role="alert" className="flex flex-col gap-2 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-strong">
              {bloqueado.titulo && <p className="m-0 text-base font-semibold">{bloqueado.titulo}</p>}
              <p className="m-0">{sinJerga(bloqueado.motivo)}</p>
              {bloqueado.accion && (
                <Link href={bloqueado.accion.href} className={`${buttonClasses("solid")} self-start`}>
                  {bloqueado.accion.etiqueta}
                </Link>
              )}
            </div>
          )}

          {/* 1 · ¿Cuánto cobraste? */}
          <Field
            label="¿Cuánto cobraste?"
            htmlFor={`${id}-total`}
            hint={inscripto ? "En pesos, con el IVA incluido." : "En pesos."}
            required
          >
            <Input
              id={`${id}-total`}
              data-testid="emitir-monto"
              inputMode="decimal"
              autoComplete="off"
              value={b.total}
              placeholder="Ej.: 25.000"
              onChange={(e) => cambiar({ total: e.target.value })}
              importe
            />
          </Field>

          {/* 2 · ¿Qué hiciste? */}
          <div className="flex flex-col gap-2">
            {(servicios.length > 0 || items.length > 0) && (
              <div role="group" aria-label="Elegí uno" className="flex flex-wrap gap-2">
                {servicios.map((s) => (
                  <Chip key={`s:${s.nombre}`} prendido={b.descripcion === s.nombre} onClick={() => cambiar(alElegirServicio(b, s))}>
                    <span className="max-w-48 truncate">{s.nombre}</span>
                  </Chip>
                ))}
                {items
                  .filter((it) => !servicios.some((s) => s.nombre === it.descripcion))
                  .map((it) => (
                    <Chip
                      key={`i:${it.descripcion}`}
                      prendido={b.descripcion === it.descripcion}
                      onClick={() => cambiar({ descripcion: it.descripcion, total: b.total.trim() ? b.total : it.total, concepto: it.concepto })}
                    >
                      <span className="max-w-40 truncate">{it.descripcion}</span>
                      <span className="tabular-nums text-muted">{it.total}</span>
                    </Chip>
                  ))}
              </div>
            )}
            <Field label="¿Qué hiciste?" htmlFor={`${id}-detalle`} hint="Contalo simple: va en la factura." required>
              <Input
                id={`${id}-detalle`}
                data-testid="emitir-concepto"
                maxLength={200}
                value={b.descripcion}
                placeholder={OPCIONES_CONCEPTO.find((o) => o.id === b.concepto)?.ejemplo}
                onChange={(e) => cambiar({ descripcion: e.target.value })}
              />
            </Field>
          </div>

          {/* 3 · A quién: plegado como consumidor final */}
          <div className="flex flex-col gap-3 rounded-lg bg-surface-sunken px-3 py-2">
            <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-muted">Le facturás a</span>
              <span className="min-w-0 font-medium text-strong [overflow-wrap:anywhere]">
                {comprador.tipo === "consumidor-final" ? "Consumidor final" : comprador.nombre.trim() || "un comprador identificado"}
              </span>
              {compradorAbierto ? (
                <button type="button" onClick={aConsumidorFinal} className="ml-auto min-h-11 font-medium text-accent-ink underline underline-offset-4">
                  Volver a consumidor final
                </button>
              ) : (
                <button
                  type="button"
                  onClick={abrirComprador}
                  aria-expanded={false}
                  aria-controls={`${id}-comprador`}
                  className="ml-auto min-h-11 font-medium text-accent-ink underline underline-offset-4"
                >
                  Poner DNI o CUIT
                </button>
              )}
            </div>

            {compradorAbierto && comprador.tipo === "identificado" && (
              <div id={`${id}-comprador`} className="grid gap-4 pb-2 sm:grid-cols-2">
                {recientes.length > 0 && (
                  <div role="group" aria-label="Compradores de antes" className="flex flex-wrap gap-2 sm:col-span-2">
                    {recientes.map((r) => (
                      <Chip
                        key={`${r.docTipo}:${r.docNro}`}
                        prendido={comprador.docNro === r.docNro && comprador.docTipo === r.docTipo}
                        onClick={() => cambiar({ comprador: r })}
                      >
                        <span className="max-w-48 truncate">{r.nombre}</span>
                      </Chip>
                    ))}
                  </div>
                )}
                <Segmented
                  name={`${id}-doc`}
                  leyenda="Documento"
                  leyendaVisible
                  opciones={DOCS}
                  value={String(comprador.docTipo)}
                  onChange={(e) => cambiarComprador({ docTipo: Number((e.target as unknown as HTMLInputElement).value) as 80 | 86 | 96 })}
                  lleno
                />
                <Field label="Número" htmlFor={`${id}-docnro`} hint={comprador.docTipo === 96 ? "7 u 8 números." : "11 números, con o sin guiones."}>
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
                  <Field label="¿Cómo está inscripto?" htmlFor={`${id}-condicion`} hint="Figura en su constancia de ARCA. De esto depende la letra." required>
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
                  <p role="note" className="m-0 rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm text-strong sm:col-span-2">
                    {avisoCuitJuridicoMonotributo(comprador.docNro, comprador.condicion)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Más detalles: productos o servicios, IVA y las fechas del servicio (ya completas). */}
          <details open={masDetalles} onToggle={(e) => setMasDetalles((e.currentTarget as HTMLDetailsElement).open)}>
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-accent-ink">Más detalles</summary>
            <div className="flex flex-col gap-4 pt-2">
              <Segmented
                name={`${id}-concepto`}
                leyenda="Vendiste"
                leyendaVisible
                opciones={OPCIONES_CONCEPTO.map((o) => ({ valor: o.id, etiqueta: o.nombre }))}
                value={b.concepto}
                onChange={(e) => cambiar({ concepto: (e.target as unknown as HTMLInputElement).value as ConceptoFacturita })}
                lleno
              />
              {inscripto && (
                <Field label="Alícuota de IVA" htmlFor={`${id}-alicuota`} hint="Si no sabés, casi siempre es la general.">
                  <Select id={`${id}-alicuota`} className={SELECT} value={b.alicuota} onChange={(e) => cambiar({ alicuota: e.target.value as AlicuotaFacturita })}>
                    {OPCIONES_ALICUOTA.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nombre}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {conceptoConFechasDeServicio(b.concepto) && (
                <fieldset className="grid gap-4 rounded-lg border border-line p-4 sm:grid-cols-3">
                  <legend className="px-1 text-sm font-medium text-strong">Fechas del servicio</legend>
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
            </div>
          </details>

          {/* El estado en criollo (error, aviso de Factura A, falta configurar). */}
          <div id={`${id}-estado`} tabIndex={-1} aria-live="assertive" className="focus:outline-none">
            {estado && <EstadoEnCriollo estado={estado} ejecutar={ejecutar} />}
          </div>

          {/* La previa en una línea y el único botón. */}
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            {linea && (
              <p className="m-0 text-sm text-body" aria-live="polite">
                <span data-testid="emitir-letra" data-letra={vista?.letra ?? ""} className="font-semibold text-strong">
                  {vista?.letra ? `Factura ${vista.letra}` : "Factura"}
                </span>
                {linea.replace(/^Factura( [ABC])?/, "")}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <Button
                data-testid="emitir-boton"
                onClick={enviar}
                disabled={pendiente || !!bloqueado || !!avisoA || !validacion?.ok}
                estado={pendiente ? "cargando" : undefined}
                className="w-full sm:w-auto"
              >
                {pendiente ? "Emitiendo…" : "Emitir"}
              </Button>
              {falta ? (
                <p className="m-0 text-sm text-muted">{falta}</p>
              ) : (
                atajosDeTeclado && (
                  <p className="m-0 hidden text-xs text-muted sm:block">
                    <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd>
                  </p>
                )
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

const TONO: Record<EstadoUx["tono"], string> = {
  ok: "border-success bg-surface-raised",
  prueba: "border-warning bg-warning-soft",
  atencion: "border-warning bg-warning-soft",
  error: "border-danger bg-surface-raised",
};

/** Un botón de un estado: enlace (interno o a WhatsApp) o una acción de la pantalla. */
function BotonDeAccion({ a, ejecutar, testid }: { a: AccionUx; ejecutar?: (a: AccionUx) => void; testid?: string }) {
  const clase = buttonClasses(a.principal ? "solid" : "outline", a.principal ? undefined : "sm");
  if (a.href && a.id === "pdf") {
    return (
      <a href={a.href} className={clase} data-testid={testid} download>
        {a.etiqueta}
      </a>
    );
  }
  if (a.href) {
    return /^https?:/.test(a.href) ? (
      <a href={a.href} target="_blank" rel="noopener noreferrer" className={clase} data-testid={testid}>
        {a.etiqueta}
      </a>
    ) : (
      <Link href={a.href} className={clase} data-testid={testid}>
        {a.etiqueta}
      </Link>
    );
  }
  return ejecutar ? (
    <Button variant={a.principal ? undefined : "outline"} size={a.principal ? undefined : "sm"} onClick={() => ejecutar(a)} data-testid={testid}>
      {a.etiqueta}
    </Button>
  ) : null;
}

/** El estado en criollo: título, qué pasó y el botón que lo resuelve. */
function EstadoEnCriollo({ estado, ejecutar }: { estado: EstadoUx; ejecutar: (a: AccionUx) => void }) {
  return (
    <div role="alert" data-estado={estado.clave} className={`flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm ${TONO[estado.tono]}`}>
      <p data-testid="error-titulo" className={`m-0 text-base font-semibold ${estado.tono === "error" ? "text-danger" : "text-strong"}`}>
        {estado.titulo}
      </p>
      <p className="m-0 text-strong">{estado.texto}</p>
      {estado.acciones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {estado.acciones.map((a) => (
            <BotonDeAccion key={a.id} a={a} ejecutar={ejecutar} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Después de emitir (diseño §5): arriba y en grande «✓ Factura B 00003-00001234 · $12.000», el CAE
 * en chico, «Mandar por WhatsApp» como principal, «Descargar PDF» y «Ver detalle». En modo de prueba,
 * la franja ámbar. Si al PDF le faltan datos del emisor, se piden ACÁ (no un aviso 409 sin salida).
 */
export function ResultadoDeEmision({
  r,
  total,
  pdf,
  enlaceDelComprobante,
  rutas,
  children,
}: {
  r: Extract<ResultadoEmisionManual, { ok: true }>;
  total: number | null;
  pdf: EmitirComprobanteProps["pdf"];
  enlaceDelComprobante?: (invoiceId: string) => string;
  /** Para «Pasar a facturar en serio» y «Ver comprobantes» (si la pantalla las tiene). */
  rutas?: RutasDeAyuda;
  children?: React.ReactNode;
}) {
  const e = r.estado;
  const autorizada = e.estado === "autorizada" ? e : null;
  // El PDF lleva el CAE de ARCA (14 números). El simulador autoriza con «STUB…»: ahí no sale, y se dice.
  const conPdf = !!autorizada && /^\d{14}$/.test(autorizada.cae ?? "");
  const whatsapp = autorizada
    ? enlaceDeWhatsApp(
        mensajeDeWhatsApp({ letra: autorizada.letra, numero: autorizada.numero, total, cae: autorizada.cae, dePrueba: autorizada.dePrueba, formatear: fmtMoneyARS }),
      )
    : null;
  const estado = estadoUx(
    { tipo: "resultado", r },
    {
      rutas: rutas ?? { datosFiscales: null, comprobantes: null },
      total,
      formatear: fmtMoneyARS,
      whatsappHref: whatsapp,
      pdfHref: conPdf && pdf && !pdf.faltanDatos ? pdf.href(r.invoiceId) : null,
      detalleHref: enlaceDelComprobante ? enlaceDelComprobante(r.invoiceId) : null,
    },
  );
  const ok = estado.tono === "ok" || estado.tono === "prueba";
  return (
    <div data-testid="exito" data-estado={estado.clave} className="flex flex-col gap-4 rounded-lg border border-line bg-surface-raised p-4">
      {estado.tono === "prueba" && (
        <p role="status" className="m-0 -mx-4 -mt-4 rounded-t-lg border-b border-warning bg-warning-soft px-4 py-2 text-sm font-medium text-strong">
          Modo de prueba: {estado.texto.charAt(0).toLowerCase()}{estado.texto.slice(1)}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <p data-testid="exito-numero" className="m-0 text-2xl font-bold tabular-nums text-strong [overflow-wrap:anywhere] sm:text-3xl">
          {ok && <span aria-hidden="true" className="text-success">✓ </span>}
          {estado.titulo}
        </p>
        {autorizada?.cae && (
          <p data-testid="exito-cae" className="m-0 text-xs text-muted">
            CAE <span className="font-mono tabular-nums [overflow-wrap:anywhere]">{autorizada.cae}</span>
          </p>
        )}
        {estado.tono !== "prueba" && <p className="m-0 text-sm text-body">{estado.texto}</p>}
        {r.limite?.mensaje && <p className="m-0 text-sm text-muted">{r.limite.mensaje}</p>}
      </div>
      {autorizada && pdf && !conPdf && (
        <p className="m-0 text-sm text-muted">El PDF sale cuando la factura tiene el CAE real de ARCA: esta es de prueba.</p>
      )}
      {autorizada && pdf?.faltanDatos}
      {estado.acciones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {estado.acciones.map((a) => (
            <BotonDeAccion
              key={a.id}
              a={a}
              testid={a.id === "whatsapp" ? "exito-whatsapp" : a.id === "pdf" ? "exito-pdf" : a.id === "detalle" ? "exito-detalle" : undefined}
            />
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
