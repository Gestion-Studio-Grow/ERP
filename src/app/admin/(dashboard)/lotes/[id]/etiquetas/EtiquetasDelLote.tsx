"use client";

// Etiquetas de los paquetes de UN lote: una fila por paquete con el peso precargado (promedio
// del lote) y editable, y abajo el rollo como va a salir. Las cuentas y el código son PUROS
// (carniceria/etiqueta-paquete.ts): lo que se imprime acá la caja lo lee con el mismo formato.

import { useActionState, useMemo, useState } from "react";
import { Input, buttonClasses, fmtMoneyARS } from "@/components/ui";
import type { FormatoBalanza } from "@/lib/supermercado/balanza";
import {
  ANCHO_ETIQUETA_MM,
  ALTO_MAX_MM,
  ALTO_MIN_MM,
  LEYENDA_MAX,
  validarEtiquetaPaquete,
  type EtiquetaPaqueteConfig,
} from "@/lib/carniceria/etiqueta-paquete-config";
import { guardarEtiquetaPaqueteDelNegocio, type EstadoEtiquetaPaquete } from "@/lib/carniceria/etiqueta-paquete-actions";
import { barrasDeModulos, datosDeEtiquetaDePaquete, modulosEan13, MODULOS_EAN13, type EtiquetaDePaquete } from "@/lib/carniceria/etiqueta-paquete";

export type DatosDelLote = {
  code: string;
  packedAt: string | null;
  expiresAt: string | null;
  packages: number;
  pesoPromedioKg: number | null;
};

const kg = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

function leerPeso(txt: string): number {
  const n = Number(txt.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : 0;
}

export default function EtiquetasDelLote({
  lote,
  producto,
  formato,
  negocio,
  bloqueo,
  etiquetaGuardada,
  version,
}: {
  lote: DatosDelLote;
  producto: { nombre: string; codigo: string | null; precioPorKilo: number };
  formato: FormatoBalanza;
  negocio: string;
  /** Si hay un motivo (lote vencido o retirado), se avisa y no se deja imprimir. */
  bloqueo: string | null;
  /** La leyenda y el alto guardados del negocio (o los de fábrica). */
  etiquetaGuardada: EtiquetaPaqueteConfig;
  /** Versión de la config de la caja leída (control de concurrencia al guardar). */
  version: string | null;
}) {
  const [leyenda, setLeyenda] = useState(etiquetaGuardada.leyenda);
  const [altoTxt, setAltoTxt] = useState(String(etiquetaGuardada.altoMm));
  const config = validarEtiquetaPaquete({ leyenda, altoMm: altoTxt });
  // Si el alto que se está tipeando no vale, se imprime con el guardado hasta corregirlo.
  const altoMm = config.ok ? config.valor.altoMm : etiquetaGuardada.altoMm;
  const leyendaImpresa = config.ok ? config.valor.leyenda : leyenda.trim().slice(0, LEYENDA_MAX);
  const [estado, guardar, guardando] = useActionState<EstadoEtiquetaPaquete, FormData>(guardarEtiquetaPaqueteDelNegocio, null);
  const versionActual = estado?.ok ? estado.version : version;

  const inicial = lote.pesoPromedioKg != null ? kg.format(lote.pesoPromedioKg) : "";
  const [pesos, setPesos] = useState<string[]>(() => Array.from({ length: Math.max(1, lote.packages) }, () => inicial));

  const etiquetas: EtiquetaDePaquete[] = useMemo(() => {
    const l = {
      code: lote.code,
      packedAt: lote.packedAt ? new Date(lote.packedAt) : null,
      expiresAt: lote.expiresAt ? new Date(lote.expiresAt) : null,
    };
    return pesos.map((p) => datosDeEtiquetaDePaquete({ producto, lote: l, pesoKg: leerPeso(p), formato, negocio, leyenda: leyendaImpresa }));
  }, [pesos, lote, producto, formato, negocio, leyendaImpresa]);

  const sinCodigo = etiquetas.find((e) => e.codigo === null)?.motivoSinCodigo ?? null;
  const puedeImprimir = !bloqueo && !sinCodigo;

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #rollo, #rollo * { visibility: visible !important; }
          #rollo { position: absolute; left: 0; top: 0; margin: 0; }
          .etiqueta-paquete { break-after: page; border: 0 !important; margin: 0 !important; }
          .etiqueta-paquete { height: ${altoMm}mm; overflow: hidden; }
          @page { size: ${ANCHO_ETIQUETA_MM}mm ${altoMm}mm; margin: 2mm; }
        }
      `}</style>

      {bloqueo && (
        <p role="alert" className="mb-4 rounded-lg border border-danger bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {bloqueo}
        </p>
      )}

      <fieldset className="mb-4">
        <legend className="mb-2 text-sm font-medium text-strong">Peso de cada paquete (kg)</legend>
        <ol className="grid gap-2 sm:grid-cols-2">
          {pesos.map((p, i) => (
            <li key={i} className="flex items-center gap-3">
              <label htmlFor={`peso-${i}`} className="w-24 text-sm text-body">
                Paquete {i + 1}
              </label>
              <Input
                id={`peso-${i}`}
                inputMode="decimal"
                value={p}
                onChange={(ev) => setPesos((xs) => xs.map((x, j) => (j === i ? ev.target.value : x)))}
                className="min-h-11 w-32 tabular-nums"
                aria-describedby={leerPeso(p) > 0 ? undefined : `peso-${i}-error`}
              />
              {!(leerPeso(p) > 0) && (
                <span id={`peso-${i}-error`} className="text-xs text-danger">
                  Falta el peso
                </span>
              )}
            </li>
          ))}
        </ol>
      </fieldset>

      <form action={guardar} className="mb-4 space-y-3" aria-describedby="etiqueta-ayuda">
        <input type="hidden" name="version" value={versionActual ?? ""} />
        <p id="etiqueta-ayuda" className="text-sm text-body">
          Leyenda y alto del papel para esta impresión. Si los guardás como predeterminados, quedan para las próximas.
        </p>
        <div>
          <label htmlFor="etiqueta-leyenda" className="mb-1 block text-sm font-medium text-strong">
            Leyenda de conservación
          </label>
          <Input
            id="etiqueta-leyenda"
            name="leyenda"
            value={leyenda}
            maxLength={LEYENDA_MAX}
            onChange={(ev) => setLeyenda(ev.target.value)}
            className="min-h-11 w-full"
          />
        </div>
        <div>
          <label htmlFor="etiqueta-alto" className="mb-1 block text-sm font-medium text-strong">
            Alto de la etiqueta (mm, de {ALTO_MIN_MM} a {ALTO_MAX_MM})
          </label>
          <Input
            id="etiqueta-alto"
            name="altoMm"
            inputMode="numeric"
            value={altoTxt}
            onChange={(ev) => setAltoTxt(ev.target.value)}
            className="min-h-11 w-32 tabular-nums"
            aria-invalid={!config.ok}
            aria-describedby={config.ok ? undefined : "etiqueta-error"}
          />
        </div>
        {!config.ok && (
          <p id="etiqueta-error" className="text-sm text-danger">
            {config.error}
          </p>
        )}
        <button type="submit" disabled={!config.ok || guardando} className={buttonClasses("outline", "md", "min-h-11")}>
          {guardando ? "Guardando…" : "Guardar como predeterminado"}
        </button>
        <p role="status" aria-live="polite" className={estado?.ok ? "text-sm text-body" : "text-sm text-danger"}>
          {estado ? (estado.ok ? estado.mensaje : estado.error) : ""}
        </p>
      </form>

      {sinCodigo && !bloqueo && (
        <p role="alert" className="mb-4 text-sm font-medium text-danger">
          {sinCodigo}
        </p>
      )}

      <button type="button" disabled={!puedeImprimir} onClick={() => window.print()} className={buttonClasses("solid", "md", "min-h-11")}>
        Imprimir {etiquetas.length === 1 ? "la etiqueta" : `las ${etiquetas.length} etiquetas`}
      </button>

      <div id="rollo" className="mt-6 flex flex-col gap-3" aria-label="Vista previa del rollo">
        {etiquetas.map((e, i) => (
          <EtiquetaImpresa key={i} e={e} altoMm={altoMm} />
        ))}
      </div>
    </div>
  );
}

// El papel va en blanco y negro fijos (no tokens del tema): es lo que imprime la térmica.
function EtiquetaImpresa({ e, altoMm }: { e: EtiquetaDePaquete; altoMm: number }) {
  return (
    <article
      className="etiqueta-paquete"
      style={{ width: `${ANCHO_ETIQUETA_MM}mm`, minHeight: `${altoMm}mm`, boxSizing: "border-box", padding: "2mm", background: "#fff", color: "#000", border: "1px dashed #999", fontFamily: "system-ui, sans-serif", fontSize: "8pt", lineHeight: 1.25 }}
    >
      {e.negocio && <div style={{ fontSize: "7pt", textTransform: "uppercase", letterSpacing: "0.5pt" }}>{e.negocio}</div>}
      <div style={{ fontSize: "11pt", fontWeight: 700 }}>{e.nombre}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1mm" }}>
        <span>{kg.format(e.pesoKg)} kg</span>
        <span>{fmtMoneyARS(e.precioPorKilo)}/kg</span>
      </div>
      <div style={{ fontSize: "13pt", fontWeight: 800, textAlign: "right" }}>{fmtMoneyARS(e.total)}</div>
      <div>
        Lote {e.lote}
        {e.envasado && ` · Envasado ${e.envasado}`}
      </div>
      <div style={{ fontWeight: 700 }}>Vence {e.vence ?? "—"}</div>
      {e.leyenda && <div style={{ fontSize: "6.5pt" }}>{e.leyenda}</div>}
      {e.codigo && <CodigoDeBarras codigo={e.codigo} />}
    </article>
  );
}

function CodigoDeBarras({ codigo }: { codigo: string }) {
  const barras = barrasDeModulos(modulosEan13(codigo));
  const margen = 9; // zona quieta a cada lado, en módulos
  const ancho = MODULOS_EAN13 + margen * 2;
  return (
    <figure style={{ margin: "1mm 0 0" }}>
      <svg viewBox={`0 0 ${ancho} 30`} width="100%" height="12mm" preserveAspectRatio="none" role="img" aria-label={`Código de balanza ${codigo}`}>
        <rect x={0} y={0} width={ancho} height={30} fill="#fff" />
        {barras.map((b) => (
          <rect key={b.x} x={b.x + margen} y={0} width={b.ancho} height={30} fill="#000" />
        ))}
      </svg>
      <figcaption style={{ textAlign: "center", fontFamily: "ui-monospace, monospace", fontSize: "7pt", letterSpacing: "1pt" }}>{codigo}</figcaption>
    </figure>
  );
}
