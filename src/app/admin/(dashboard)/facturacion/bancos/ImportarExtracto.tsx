"use client";

// Importación del extracto bancario: zona de arrastrar-y-soltar + input file
// accesible (label real, foco visible), spinner honesto mientras el server
// procesa, resumen del lote como chips, alertas de cap con role="alert" y —
// cuando la confianza del mapeo es baja — la vista previa de columnas
// (MapeoPreview) para confirmar antes de emitir nada.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  procesarExtractoAction,
  confirmarMapeoAction,
  type ResultadoProcesarExtracto,
} from "@/lib/bancos-actions";
import type { AlertaBancos, MapeoColumnas } from "@/plugins/bancos";
import { Badge, fmtNumberAR } from "@/components/ui";
import { useToast } from "../../ToastProvider";
import MapeoPreview from "./MapeoPreview";

const EXTENSIONES = [".csv", ".xlsx", ".xls"];

function extensionValida(nombre: string): boolean {
  const n = nombre.toLowerCase();
  return EXTENSIONES.some((ext) => n.endsWith(ext));
}

/**
 * Parsea el archivo EN EL NAVEGADOR con los parsers puros del plugin, solo
 * para las filas de muestra del preview de mapeo. El de XLSX se importa
 * dinámico (SheetJS pesa) y únicamente si el archivo es Excel de verdad
 * (firma ZIP `PK` o compound BIFF), no por la extensión que diga el nombre.
 */
async function parsearParaPreview(archivo: File): Promise<unknown[][] | null> {
  try {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const esZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
    const esBiff = bytes[0] === 0xd0 && bytes[1] === 0xcf;
    if (esZip || esBiff) {
      const { parsearXlsx } = await import("@/plugins/bancos/parser/xlsx");
      return parsearXlsx(bytes);
    }
    const { parsearCsv } = await import("@/plugins/bancos/parser/csv");
    return parsearCsv(bytes);
  } catch {
    return null; // el preview de filas es un extra: sin él, los selects alcanzan
  }
}

function AlertaBox({ alerta }: { alerta: AlertaBancos }) {
  // cap-90 / cap-100 son las alertas que piden atención YA (role="alert").
  const grave = alerta.tipo === "cap-100";
  const media = alerta.tipo === "cap-90" || alerta.tipo === "extracto-vacio";
  return (
    <p
      role={grave || media ? "alert" : undefined}
      className={`rounded-md px-3 py-2 text-sm ${
        grave
          ? "bg-danger-soft text-danger"
          : media
            ? "bg-warning-soft text-warning"
            : "bg-info-soft text-info"
      }`}
    >
      {alerta.mensaje}
    </p>
  );
}

export default function ImportarExtracto() {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [arrastrando, setArrastrando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoProcesarExtracto | null>(null);
  const [matrizPreview, setMatrizPreview] = useState<unknown[][] | null>(null);
  const [mapeoListo, setMapeoListo] = useState(false);

  async function procesar(archivo: File) {
    if (!extensionValida(archivo.name)) {
      showError("Ese archivo no parece un extracto: subí un .csv, .xlsx o .xls del banco.");
      return;
    }
    setProcesando(true);
    setResultado(null);
    setMatrizPreview(null);
    setMapeoListo(false);
    setNombreArchivo(archivo.name);
    try {
      const fd = new FormData();
      fd.set("archivo", archivo);
      const res = await procesarExtractoAction(fd);
      setResultado(res);
      if (res.ok) {
        if (res.requiereConfirmacionMapeo) {
          // El preview de filas se arma con el archivo que sigue en memoria.
          setMatrizPreview(await parsearParaPreview(archivo));
        } else {
          setMapeoListo(true);
          showSuccess(`Extracto procesado: ${res.resumen.importados} movimientos nuevos.`);
        }
        router.refresh(); // KPIs + cola + últimas importaciones al día
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "No se pudo procesar el extracto.");
    } finally {
      setProcesando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function confirmarMapeo(mapeoCorregido: MapeoColumnas) {
    if (!resultado?.ok) return;
    setConfirmando(true);
    try {
      const res = await confirmarMapeoAction(resultado.importacionId, mapeoCorregido);
      if (res.ok) {
        setResultado(res);
        setMapeoListo(true);
        showSuccess(
          `Mapeo confirmado — el extracto se re-procesó: ${res.resumen.importados} movimientos.`,
        );
        router.refresh();
      } else {
        showError(res.error);
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "No se pudo confirmar el mapeo.");
    } finally {
      setConfirmando(false);
    }
  }

  const resumen = resultado?.ok ? resultado.resumen : null;

  return (
    <div className="space-y-4">
      {/* Zona de subida — label real alrededor del input (accesible por teclado:
          el input sr-only recibe foco y el anillo se dibuja en la caja). */}
      <label
        htmlFor="extracto-file"
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          const archivo = e.dataTransfer.files?.[0];
          if (archivo && !procesando) void procesar(archivo);
        }}
        className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus ${
          arrastrando
            ? "border-accent bg-accent-soft"
            : "border-line-strong bg-surface-raised hover:border-accent hover:bg-accent-soft/40"
        } ${procesando ? "pointer-events-none opacity-70" : ""}`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-6 text-faint"
          aria-hidden
        >
          <path d="M12 16V4" />
          <path d="M7 9l5-5 5 5" />
          <path d="M4 20h16" />
        </svg>
        <span className="text-sm font-medium text-strong">
          Subí el extracto de tu banco
        </span>
        <span className="text-xs text-muted">
          Arrastralo acá o tocá para elegirlo · CSV o Excel (.csv, .xlsx, .xls), tal cual lo baja el
          homebanking
        </span>
        <input
          ref={inputRef}
          id="extracto-file"
          name="archivo"
          type="file"
          accept=".csv,.xlsx,.xls"
          disabled={procesando}
          className="sr-only"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) void procesar(archivo);
          }}
        />
      </label>

      {/* Resultado del procesamiento — región viva para lectores de pantalla. */}
      <div aria-live="polite" aria-busy={procesando} className="space-y-3">
        {procesando && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <span
              aria-hidden
              className="size-4 shrink-0 rounded-full border-2 border-line-strong border-t-accent motion-safe:animate-spin"
            />
            Leyendo {nombreArchivo ?? "el extracto"}… puede tardar unos segundos si tiene muchos
            movimientos.
          </p>
        )}

        {resultado && !resultado.ok && (
          <div className="space-y-2">
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {resultado.error}
            </p>
            {resultado.alertas.map((a, i) => (
              <AlertaBox key={i} alerta={a} />
            ))}
          </div>
        )}

        {resultado?.ok && resumen && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2" data-testid="resumen-lote">
              <span className="text-sm text-muted">
                {nombreArchivo ? `${nombreArchivo}:` : "Resultado:"}
              </span>
              <Badge tone="accent" dot>{fmtNumberAR(resumen.importados)} importados</Badge>
              <Badge tone="success" dot>{fmtNumberAR(resumen.autos)} listos para emitir</Badge>
              <Badge tone="warning" dot>{fmtNumberAR(resumen.aRevisar)} a revisar</Badge>
              <Badge tone="neutral" dot>{fmtNumberAR(resumen.duplicados)} duplicados</Badge>
              <Badge tone="neutral" dot>{fmtNumberAR(resumen.noFacturables)} no facturables</Badge>
            </div>

            {resultado.alertas.map((a, i) => (
              <AlertaBox key={i} alerta={a} />
            ))}

            {resultado.requiereConfirmacionMapeo && !mapeoListo && (
              <MapeoPreview
                mapeo={resultado.mapeo}
                matriz={matrizPreview}
                confirmando={confirmando}
                onConfirmar={(m) => void confirmarMapeo(m)}
              />
            )}

            {mapeoListo && resumen.aRevisar > 0 && (
              <p className="text-sm text-muted">
                {resumen.aRevisar === 1
                  ? "Hay 1 venta que necesita los datos del comprador — está abajo, en la cola de revisión."
                  : `Hay ${resumen.aRevisar} ventas que necesitan los datos del comprador — están abajo, en la cola de revisión.`}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
