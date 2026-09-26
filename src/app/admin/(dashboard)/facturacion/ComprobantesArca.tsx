"use client";

// ============================================================================
// COMPROBANTES — la lista con su estado ante ARCA. UNA sola lista para los dos diseños.
// ============================================================================
//
// Para un comercio con miles de comprobantes por mes: página de 50 armada en el servidor, filtros
// en la URL (estado ante ARCA, período —el mes en curso por defecto—, tipo y punto de venta), un
// buscador (número, CUIT/DNI o nombre del receptor, importe) y los totales del filtro ENTERO, que
// calcula la base (src/lib/facturacion/lista.server.ts). Arriba, lo que necesita atención
// (pendientes y rechazados) con un toque para verlo, y la tecla de siempre: «Autorizar los
// pendientes» (`procesarFacturacionPendiente`). Cada renglón abre el comprobante.
//
// El formulario de filtros es un GET común: funciona sin JavaScript, se comparte y se recarga.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { procesarFacturacionPendiente, type EstadoFiscal } from "@/lib/facturacion-actions";
import { emitirFacturaDePruebaAction } from "@/lib/arca-pruebas-actions";
import { autorizarEnTandas, avisoDeAutorizar } from "@/lib/facturacion/autorizar-en-tandas";
import {
  ESTADOS,
  POR_PAGINA,
  TIPOS,
  mesDe,
  nombreDeTipo,
  nombreDelReceptor,
  urlDeLista,
  type FiltrosComprobantes,
  type PaginaDeComprobantes,
  type RenglonComprobante,
} from "@/lib/facturacion/lista-core";
import { Tabla } from "@/components/ui/Tabla";
import { Button, Marca, Plata } from "@/components/ui";
import { useToast } from "../ToastProvider";
import { fechaDeComprobante, numeroDeComprobante } from "./EstadoArca";
import FacturaDePrueba from "./FacturaDePrueba";

const BASE = "/admin/facturacion";
const CAMPO = "mt-1 min-h-11 w-full rounded-md border border-line bg-surface px-3 text-base text-strong sm:text-sm";
const ENLACE = "inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-4";
const miles = (n: number) => n.toLocaleString("es-AR");
const dia = (iso: string) => fechaDeComprobante(iso.replaceAll("-", ""));

/** El estado ante ARCA de un renglón (con el motivo, si lo rechazaron). */
function EstadoAnteArca({ f, conMotivo }: { f: RenglonComprobante; conMotivo: boolean }) {
  if (f.status === "AUTHORIZED") return <Marca tipo="hecho">Autorizado</Marca>;
  if (f.status === "REJECTED") {
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-2">
        <Marca tipo="anulado">Rechazado</Marca>
        {conMotivo && f.rechazoMotivo && <span className="text-danger">{f.rechazoMotivo}</span>}
      </span>
    );
  }
  return <Marca tipo="pendiente">Pendiente de autorizar</Marca>;
}

/** El mes anterior al del filtro (o al de hoy), para la salida del estado vacío. */
function mesAnterior(desde: string): { desde: string; hasta: string } {
  const [a, m] = desde.split("-").map(Number);
  return mesDe(m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, "0")}-01`);
}

export default function ComprobantesArca({
  lista,
  filtros,
  estado,
  hoy,
  fallo = false,
}: {
  lista: PaginaDeComprobantes;
  filtros: FiltrosComprobantes;
  estado: EstadoFiscal;
  /** AAAA-MM-DD en la hora del negocio: define el «mes en curso». */
  hoy: string;
  fallo?: boolean;
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [procesando, setProcesando] = useState(false);
  const [mandados, setMandados] = useState<number | null>(null);
  const [probando, setProbando] = useState(false);
  const { totales, renglones, pagina, paginas } = lista;
  const p = totales.porEstado;
  const mes = mesDe(hoy);
  const conFiltro = Boolean(filtros.q) || filtros.estado !== "todos" || filtros.tipo !== "todos" || filtros.puntoVenta !== null;
  // Con el mes en curso las fechas del formulario quedan en blanco: así, si se escribe algo en el
  // buscador, la búsqueda va a todos los meses (lista-core.ts) en vez de quedar atada al mes.
  const mesEnCurso = filtros.desde === mes.desde && filtros.hasta === mes.hasta;
  const porDefecto = !conFiltro && mesEnCurso;
  const exportar = urlDeLista(`${BASE}/exportar`, filtros, { pagina: 1 });

  // Un toque manda TODOS los pendientes, de a tandas de 20 (lib/facturacion/autorizar-en-tandas.ts):
  // el botón dice cuántos lleva mientras manda.
  async function autorizar() {
    setProcesando(true);
    setMandados(0);
    try {
      // `saltear`: lo que en este toque ya falló por un error nuestro no se vuelve a mandar.
      const r = await autorizarEnTandas((saltear) => procesarFacturacionPendiente([...saltear]), estado.pendientes, (parcial) => {
        setMandados(parcial.procesados);
        router.refresh();
      });
      const aviso = avisoDeAutorizar(r);
      if (aviso.tono === "ok") showSuccess(aviso.texto);
      else showError(aviso.texto);
      router.refresh();
    } catch (e) {
      showError(e instanceof Error ? e.message : "No se pudo mandar a ARCA. Probá de nuevo en un rato.");
      router.refresh();
    } finally {
      setProcesando(false);
      setMandados(null);
    }
  }

  async function probar() {
    setProbando(true);
    try {
      // Prueba de conexión: no se guarda ningún comprobante, por eso la lista no cambia.
      const r = await emitirFacturaDePruebaAction();
      if (r.ok) showSuccess(`ARCA respondió: CAE de prueba ${r.cae}. Es sólo una prueba de conexión: no queda en la lista.`);
      else showError(r.error);
    } finally {
      setProbando(false);
    }
  }

  const periodo =
    filtros.desde && filtros.hasta
      ? `del ${dia(filtros.desde)} al ${dia(filtros.hasta)}`
      : filtros.desde
        ? `desde el ${dia(filtros.desde)}`
        : filtros.hasta
          ? `hasta el ${dia(filtros.hasta)}`
          : "de todos los meses";

  const vacio = fallo ? (
    <span>No se pudo leer la lista. Recargá la página; si sigue igual, avisale a soporte.</span>
  ) : conFiltro ? (
    <span className="flex flex-wrap items-center gap-x-4">
      No hay comprobantes para este filtro {periodo}.
      <Link href={urlDeLista(BASE, filtros, { q: "", estado: "todos", tipo: "todos", puntoVenta: null, pagina: 1 })} className={ENLACE}>
        Sacar los filtros
      </Link>
    </span>
  ) : (
    <span className="flex flex-wrap items-center gap-x-4">
      No hay comprobantes {periodo}. Se generan al facturar una venta, un cobro o desde Facturación automática.
      <Link href={urlDeLista(BASE, filtros, { ...mesAnterior(filtros.desde ?? mes.desde), pagina: 1 })} className={ENLACE}>
        Ver el mes anterior
      </Link>
    </span>
  );

  return (
    <section aria-label="Comprobantes" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button onClick={autorizar} disabled={procesando || estado.pendientes === 0} estado={procesando ? "cargando" : undefined}>
          {procesando && mandados !== null && mandados > 0
            ? `Mandando a ARCA: ${miles(mandados)} listos`
            : estado.pendientes === 0
              ? "Nada pendiente de autorizar"
              : `Autorizar ${estado.pendientes === 1 ? "el pendiente" : `los ${miles(estado.pendientes)} pendientes`}`}
        </Button>
        {/* Con la factura de prueba de verdad (debajo), la prueba de conexión sobra. */}
        {!estado.facturaDePrueba && estado.modo !== "real" && (
          <Button variant="outline" onClick={probar} disabled={probando} estado={probando ? "cargando" : undefined}>
            Probar la conexión con ARCA
          </Button>
        )}
      </div>
      {estado.facturaDePrueba && (
        <div className="mb-3">
          <FacturaDePrueba />
        </div>
      )}

      {/* Los totales del filtro entero; lo que necesita atención, con un toque para verlo. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 text-sm text-muted" aria-live="polite">
        <span className="min-h-11 inline-flex items-center gap-1">
          <strong className="tabular-nums text-strong">{miles(totales.cantidad)}</strong>
          {totales.cantidad === 1 ? "comprobante" : "comprobantes"} {periodo}
        </span>
        <span className="inline-flex min-h-11 items-center gap-2">
          <Marca tipo="hecho">{miles(p.AUTHORIZED.cantidad)} {p.AUTHORIZED.cantidad === 1 ? "autorizado" : "autorizados"}</Marca>
          <Plata valor={p.AUTHORIZED.importe} />
        </span>
        {p.PENDING.cantidad > 0 && (
          <Link href={urlDeLista(BASE, filtros, { estado: "pendiente", pagina: 1 })} className="inline-flex min-h-11 items-center gap-2">
            <Marca tipo="pendiente">{miles(p.PENDING.cantidad)} {p.PENDING.cantidad === 1 ? "pendiente" : "pendientes"}</Marca>
            <Plata valor={p.PENDING.importe} />
          </Link>
        )}
        {p.REJECTED.cantidad > 0 && (
          <Link href={urlDeLista(BASE, filtros, { estado: "rechazada", pagina: 1 })} className="inline-flex min-h-11 items-center gap-2">
            <Marca tipo="anulado">{miles(p.REJECTED.cantidad)} {p.REJECTED.cantidad === 1 ? "rechazado" : "rechazados"}</Marca>
            <Plata valor={p.REJECTED.importe} />
          </Link>
        )}
        {/* Los importes van con signo (lista.server.ts): una factura anulada con su nota suma $0. */}
        {totales.cantidad > 0 && (filtros.tipo === "todos" || filtros.tipo === "NC") && (
          <span className="inline-flex min-h-11 items-center">Las notas de crédito restan.</span>
        )}
      </div>

      <form method="get" action={BASE} role="search" aria-label="Buscar y filtrar comprobantes" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-6">
        <label className="col-span-2 sm:col-span-6">
          <span className="sr-only">Buscar</span>
          <input type="search" name="q" defaultValue={filtros.q} maxLength={80} placeholder="Buscar por número, CUIT o DNI, nombre o importe" className={CAMPO} />
        </label>
        <label className="col-span-2 text-xs text-muted">
          Estado ante ARCA
          <select name="estado" defaultValue={filtros.estado} className={CAMPO}>
            {ESTADOS.map((e) => (
              <option key={e.valor} value={e.valor}>{e.etiqueta}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Tipo
          <select name="tipo" defaultValue={filtros.tipo} className={CAMPO}>
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Punto de venta
          <input type="number" inputMode="numeric" min={1} name="pv" defaultValue={filtros.puntoVenta ?? ""} placeholder="Todos" className={CAMPO} />
        </label>
        <label className="min-w-0 text-xs text-muted">
          Desde
          <input type="date" name="desde" defaultValue={mesEnCurso ? "" : (filtros.desde ?? "")} className={CAMPO} />
        </label>
        <label className="min-w-0 text-xs text-muted">
          Hasta
          <input type="date" name="hasta" defaultValue={mesEnCurso ? "" : (filtros.hasta ?? "")} className={CAMPO} />
        </label>
        <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 sm:col-span-6">
          <Button type="submit">Ver</Button>
          {!porDefecto && (
            <Link href={BASE} className={ENLACE}>
              Volver al mes en curso
            </Link>
          )}
          {totales.cantidad > 0 && (
            <a href={exportar} className={ENLACE} download>
              Bajar este filtro en CSV
            </a>
          )}
        </div>
        <p className="col-span-2 text-xs text-muted sm:col-span-6">
          {filtros.q && !filtros.desde && !filtros.hasta
            ? "Buscando en todos los meses. Para acotar, elegí las fechas."
            : "Sin fechas se ve el mes en curso; si buscás algo, se busca en todos los meses."}
        </p>
      </form>

      <Tabla<RenglonComprobante>
        titulo="Comprobantes y su estado ante ARCA"
        filas={renglones}
        clave={(f) => f.id}
        enlace={(f) => `${BASE}/comprobante/${f.id}`}
        teclado={renglones.length > 0}
        vacio={vacio}
        cuenta={paginas > 1 ? `Página ${miles(pagina)} de ${miles(paginas)}` : undefined}
        columnas={[
          { clave: "fecha", titulo: "Fecha", movil: "folio", celda: (f) => fechaDeComprobante(f.fecha) },
          {
            clave: "numero",
            titulo: "Comprobante",
            movil: "asunto",
            celda: (f) => (
              <span className="inline-flex flex-wrap items-baseline gap-x-2">
                <span>{nombreDeTipo(f.tipoComprobante)}</span>
                <span className="tabular-nums">{numeroDeComprobante(f.puntoVenta, f.numero)}</span>
              </span>
            ),
          },
          {
            clave: "receptor",
            titulo: "Receptor",
            movil: "detalle",
            // En el celular la tabla muestra una sola línea de detalle: el estado va al lado del
            // receptor (la columna «Estado ante ARCA» se esconde ahí).
            celda: (f) => (
              <span className="inline-flex flex-wrap items-baseline gap-x-2">
                <span>{nombreDelReceptor(f)}</span>
                <span className="hidden tabla-movil:inline-flex">
                  <EstadoAnteArca f={f} conMotivo={false} />
                </span>
              </span>
            ),
          },
          { clave: "estado", titulo: "Estado ante ARCA", movil: "detalle", celda: (f) => <EstadoAnteArca f={f} conMotivo /> },
          {
            clave: "cae",
            titulo: "CAE",
            movil: "oculta",
            celda: (f) => (f.cae ? <span className="tabular-nums">{f.cae}</span> : <span className="text-muted">—</span>),
          },
          { clave: "total", titulo: "Total", alinear: "derecha", movil: "plata", celda: (f) => <Plata valor={f.total} /> },
        ]}
      />

      {paginas > 1 && (
        <nav aria-label="Páginas de comprobantes" className="mt-3 flex items-center justify-between gap-2 text-sm">
          {pagina > 1 ? (
            <Link href={urlDeLista(BASE, filtros, { pagina: pagina - 1 })} className={ENLACE} rel="prev">
              ← Más nuevos
            </Link>
          ) : (
            <span />
          )}
          <span className="tabular-nums text-muted">
            {miles((pagina - 1) * POR_PAGINA + 1)}–{miles(Math.min(pagina * POR_PAGINA, totales.cantidad))} de {miles(totales.cantidad)}
          </span>
          {pagina < paginas ? (
            <Link href={urlDeLista(BASE, filtros, { pagina: pagina + 1 })} className={ENLACE} rel="next">
              Más viejos →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}
