// El comprobante "en papel" de la demo: la foto que sacaría quien rinde, dibujada en HTML.
//
// Es una ilustración, no un documento: el QR es un dibujo determinista (sale de una semilla,
// siempre igual para el mismo comprobante) con la forma de un QR real, pero NO se puede
// escanear. Para leer un QR de verdad está "Probar con un QR real".
//
// El papel es papel en los dos temas (fondo claro y tinta oscura fijos, ver .rendi-papel en
// estilos.tsx): así se lee igual que la foto de un ticket. Para lectores de pantalla el ticket
// entero es UNA imagen con su descripción; el detalle visual queda oculto.

import { etiquetaClase, formatearFecha, formatearPesos, tipoArcaDesdeClase, type DatosComprobante } from "@/lib/rendiciones";
import { cn, fmtCuit } from "@/components/ui";
import { LETRA_CLASE, numeroOficial } from "./derivados";
import { escenarioDemo } from "./escenario";

export interface RenglonTicket {
  descripcion: string;
  importe: number;
}

export function descripcionTicket(d: DatosComprobante): string {
  return `${etiquetaClase(d.clase)} de ${d.razonSocialEmisor ?? "un emisor sin nombre"} por ${formatearPesos(d.total)}, del ${formatearFecha(d.fecha)}`;
}

export function Ticket({
  datos,
  semilla,
  renglones,
  concepto,
  domicilio,
  conQr = Boolean(datos.cae),
  className,
}: {
  datos: DatosComprobante;
  /** Semilla del QR dibujado (el id del comprobante): mismo comprobante, mismo dibujo. */
  semilla: string;
  renglones?: RenglonTicket[];
  /** Si no hay renglones, una línea con este concepto (p. ej. el tipo de gasto). */
  concepto?: string;
  domicilio?: string;
  conQr?: boolean;
  className?: string;
}) {
  if (datos.clase === "sin_comprobante") {
    return (
      <figure
        role="img"
        aria-label={`Gasto sin comprobante por ${formatearPesos(datos.total)}, del ${formatearFecha(datos.fecha)}`}
        className={cn("grid place-items-center rounded-lg border-2 border-dashed border-line-strong p-6 text-center", className)}
      >
        <div aria-hidden="true">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Sin comprobante</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-strong">{formatearPesos(datos.total)}</p>
          <p className="mt-1 text-xs text-muted">Declarado por la persona · {formatearFecha(datos.fecha)}</p>
        </div>
      </figure>
    );
  }

  const esTique = datos.esControladorFiscal || datos.clase === "tique_consumidor_final" || datos.clase === "tique_peaje";
  const codigo = tipoArcaDesdeClase(datos.clase);
  const lineas: RenglonTicket[] =
    renglones ??
    [{ descripcion: concepto ?? "Según comprobante", importe: datos.lineasIva.length ? sumarNetos(datos) : datos.total }];

  return (
    <div className="rendi-ticket-sombra">
      <figure
        role="img"
        aria-label={descripcionTicket(datos)}
        className={cn("rendi-papel rendi-corte px-4 pb-6 pt-4 text-[11px] leading-[1.45]", esTique && "font-mono", className)}
      >
        <div aria-hidden="true">
          {/* Encabezado del emisor */}
          <p className="text-center text-[12.5px] font-bold uppercase tracking-wide">{datos.razonSocialEmisor ?? "Emisor"}</p>
          {domicilio ? <p className="text-center opacity-75">{domicilio}</p> : null}
          {datos.cuitEmisor ? (
            <p className="text-center opacity-75">
              CUIT {fmtCuit(datos.cuitEmisor)}
              {condicionIva(datos.clase) ? ` · ${condicionIva(datos.clase)}` : ""}
            </p>
          ) : null}

          {/* Letra y tipo */}
          <div className="mt-2.5 flex items-center justify-center gap-2.5 border-y border-dashed border-current/30 py-2">
            <span className="grid size-9 place-items-center rounded-[4px] border-2 border-current text-lg font-black leading-none">
              {LETRA_CLASE[datos.clase]}
            </span>
            <span className="text-left">
              <span className="block font-bold uppercase">{esTique ? etiquetaClase(datos.clase) : "Factura"}</span>
              {codigo ? <span className="block opacity-75">Cód. {String(codigo).padStart(2, "0")}</span> : null}
            </span>
          </div>
          <div className="mt-1.5 flex justify-between gap-2">
            <span>N.º {numeroOficial(datos)}</span>
            <span>{formatearFecha(datos.fecha)}</span>
          </div>
          <p className="truncate opacity-75">
            {datos.cuitReceptor === escenarioDemo.empresa.cuit
              ? `A: ${escenarioDemo.empresa.razonSocial}`
              : datos.cuitReceptor
                ? `A: CUIT ${fmtCuit(datos.cuitReceptor)}`
                : "A consumidor final"}
          </p>

          {/* Renglones */}
          <div className="mt-2 space-y-0.5 border-t border-dashed border-current/30 pt-2">
            {lineas.map((l, i) => (
              <Renglon key={i} texto={l.descripcion} importe={l.importe} />
            ))}
          </div>

          {/* Totales */}
          <div className="mt-2 space-y-0.5 border-t border-dashed border-current/30 pt-2">
            {datos.lineasIva.map((l, i) => (
              <div key={i}>
                <Renglon texto={`Neto gravado ${l.alicuota} %`} importe={l.neto} tenue />
                <Renglon texto={`IVA ${l.alicuota} %`} importe={l.iva} tenue />
              </div>
            ))}
            {datos.impuestosInternos ? <Renglon texto="Impuestos internos / ITC" importe={datos.impuestosInternos} tenue /> : null}
            {datos.percepciones.map((p, i) => (
              <Renglon key={i} texto={`Percepción ${p.regimen.toUpperCase()}${p.jurisdiccion ? ` ${p.jurisdiccion}` : ""}`} importe={p.importe} tenue />
            ))}
            {datos.noGravado ? <Renglon texto="No gravado" importe={datos.noGravado} tenue /> : null}
            {datos.exento ? <Renglon texto="Exento" importe={datos.exento} tenue /> : null}
            <div className="flex justify-between pt-1 text-[13px] font-bold">
              <span>TOTAL</span>
              <span className="tabular-nums">{formatearPesos(datos.total)}</span>
            </div>
            {datos.ivaContenido ? (
              <p className="pt-1 opacity-75">Transparencia fiscal · IVA contenido {formatearPesos(datos.ivaContenido)}</p>
            ) : null}
            {datos.leyendaA !== "ninguna" ? (
              <p className="mt-1.5 rounded-[3px] border border-current px-1.5 py-1 text-center font-bold uppercase">
                {datos.leyendaA === "operacion_sujeta_a_retencion" ? "Operación sujeta a retención" : "Pago en CBU informada"}
              </p>
            ) : null}
          </div>

          {/* Pie: QR + CAE, o marca de controlador fiscal */}
          <div className="mt-3 flex items-center gap-3 border-t border-dashed border-current/30 pt-3">
            {conQr ? (
              <>
                <QrDibujado semilla={semilla} />
                <div className="min-w-0">
                  <p className="font-semibold">Comprobante autorizado</p>
                  {datos.cae ? <p className="break-all opacity-75">CAE {datos.cae}</p> : null}
                </div>
              </>
            ) : (
              <p className="w-full text-center opacity-75">Controlador fiscal · sin QR</p>
            )}
          </div>
        </div>
      </figure>
    </div>
  );
}

function Renglon({ texto, importe, tenue }: { texto: string; importe: number; tenue?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3", tenue && "opacity-75")}>
      <span className="min-w-0 truncate">{texto}</span>
      <span className="shrink-0 tabular-nums">{formatearPesos(importe)}</span>
    </div>
  );
}

/**
 * Condición frente al IVA que imprime el emisor, deducida de la clase: la C la emite un
 * monotributista; A, B, M, el tique factura A y el de peaje, un responsable inscripto. El tique a
 * consumidor final lo emiten los dos, así que ahí no se imprime nada (no se inventa el dato).
 */
function condicionIva(clase: DatosComprobante["clase"]): string | undefined {
  switch (clase) {
    case "factura_c":
      return "Responsable Monotributo";
    case "factura_a":
    case "factura_b":
    case "factura_m":
    case "tique_factura_a":
    case "tique_peaje":
      return "IVA Responsable Inscripto";
    default:
      return undefined;
  }
}

function sumarNetos(d: DatosComprobante): number {
  return d.lineasIva.reduce((s, l) => s + l.neto, 0);
}

/** Miniatura para listas y bandejas. Decorativa: la fila de al lado ya dice qué es. */
export function MiniTicket({ datos, className }: { datos: DatosComprobante; className?: string }) {
  if (datos.clase === "sin_comprobante") {
    return (
      <span
        aria-hidden="true"
        className={cn("grid h-14 w-11 shrink-0 place-items-center rounded-[5px] border-2 border-dashed border-line-strong text-muted", className)}
      >
        —
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn("rendi-papel flex h-14 w-11 shrink-0 flex-col items-center rounded-[5px] pt-1.5", className)}
    >
      <span className="grid size-[18px] place-items-center rounded-[3px] border-[1.5px] border-current text-[10px] font-black leading-none">
        {LETRA_CLASE[datos.clase]}
      </span>
      <span className="mt-1.5 h-[2px] w-7 rounded bg-current opacity-25" />
      <span className="mt-1 h-[2px] w-5 rounded bg-current opacity-25" />
      {datos.cae ? <span className="rendi-mini-qr mt-1.5 size-3.5" /> : <span className="mt-1 h-[2px] w-6 rounded bg-current opacity-25" />}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QR dibujado (determinista, NO escaneable)
// ─────────────────────────────────────────────────────────────────────────────

function QrDibujado({ semilla }: { semilla: string }) {
  const { camino, lado } = caminoQr(semilla);
  return (
    <svg viewBox={`-1 -1 ${lado + 2} ${lado + 2}`} className="size-[72px] shrink-0 bg-white" aria-hidden="true">
      <path d={camino} fill="#111" shapeRendering="crispEdges" />
    </svg>
  );
}

/** Módulos de un QR de 25×25: tres ojos, líneas de sincronía y "datos" pseudoaleatorios. */
function caminoQr(semilla: string): { camino: string; lado: number } {
  const lado = 25;
  // FNV-1a para sembrar y mulberry32 para generar: mismo texto, mismo dibujo, sin Math.random.
  let hash = 2166136261;
  for (let i = 0; i < semilla.length; i++) {
    hash ^= semilla.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let estado = hash >>> 0;
  const azar = () => {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const modulos: boolean[][] = [];
  for (let f = 0; f < lado; f++) {
    const fila: boolean[] = [];
    for (let c = 0; c < lado; c++) fila.push(azar() < 0.48);
    modulos.push(fila);
  }
  const ojo = (f0: number, c0: number) => {
    for (let f = -1; f <= 7; f++) {
      for (let c = -1; c <= 7; c++) {
        const ff = f0 + f;
        const cc = c0 + c;
        if (ff < 0 || cc < 0 || ff >= lado || cc >= lado) continue;
        const dentro = f >= 0 && f <= 6 && c >= 0 && c <= 6;
        const borde = f === 0 || f === 6 || c === 0 || c === 6;
        const centro = f >= 2 && f <= 4 && c >= 2 && c <= 4;
        modulos[ff][cc] = dentro && (borde || centro);
      }
    }
  };
  ojo(0, 0);
  ojo(0, lado - 7);
  ojo(lado - 7, 0);
  for (let i = 8; i < lado - 8; i++) {
    modulos[6][i] = i % 2 === 0;
    modulos[i][6] = i % 2 === 0;
  }

  let camino = "";
  for (let f = 0; f < lado; f++) {
    for (let c = 0; c < lado; c++) {
      if (modulos[f][c]) camino += `M${c} ${f}h1v1h-1z`;
    }
  }
  return { camino, lado };
}
