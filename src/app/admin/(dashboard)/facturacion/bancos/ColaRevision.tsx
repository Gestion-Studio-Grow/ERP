"use client";

// Cola de revisión — tabla operativa + panel de detalle sticky con tabs
// (patrón del mockup GSG Fable claro). Acá caen las ventas que superan el
// umbral de identificación, los posibles duplicados y lo que el clasificador
// no pudo resolver solo. El panel completa los datos del comprador con
// validación EN VIVO del dígito verificador (cuitValido, del plugin) o marca
// el movimiento como no facturable, con opción de aprender el patrón.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  completarRevisionAction,
  marcarNoFacturableAction,
  type PropuestaVista,
} from "@/lib/bancos-actions";
// Import por subpath del dominio (función pura, sin dependencias): traer el
// index del plugin metería SheetJS entero en este bundle client.
import { cuitValido } from "@/plugins/bancos/domain/cuit";
import { Badge, Button, EmptyState, Field, Input, fmtMoneyARS } from "@/components/ui";
import { useToast } from "../../ToastProvider";
import { DOC_TIPOS, fechaAr, motivoCorto } from "./helpers";

// ── Validación en vivo del documento (solo feedback; la de verdad corre server-side) ──

function validarDocEnVivo(docTipo: number, docNro: string): { texto: string; tono: "ok" | "error" | "neutro" } {
  const digitos = docNro.replace(/\D/g, "");
  if (docTipo === 99) return { texto: "Consumidor final: se confirma sin identificar.", tono: "neutro" };
  if (digitos.length === 0) return { texto: "Ingresá el número, solo dígitos (los guiones no hacen falta).", tono: "neutro" };
  if (docTipo === 96) {
    return /^\d{7,8}$/.test(digitos)
      ? { texto: "DNI con formato válido.", tono: "ok" }
      : { texto: "El DNI lleva 7 u 8 dígitos.", tono: digitos.length > 8 ? "error" : "neutro" };
  }
  if (digitos.length < 11) return { texto: `Van ${digitos.length} de 11 dígitos.`, tono: "neutro" };
  return cuitValido(digitos)
    ? { texto: "Dígito verificador correcto.", tono: "ok" }
    : { texto: "Ese CUIT/CUIL no pasa el dígito verificador — revisalo.", tono: "error" };
}

// ── Panel de detalle (keyed por propuesta: cambia la fila, se resetea el form) ──

function PanelDetalle({
  propuesta,
  headingRef,
  onResuelta,
}: {
  propuesta: PropuestaVista;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onResuelta: (id: string) => void;
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();

  const [tab, setTab] = useState<"movimiento" | "emision">("emision");
  const [docTipo, setDocTipo] = useState<number>(propuesta.docTipo ?? 80);
  const [docNro, setDocNro] = useState(propuesta.docNro ?? "");
  const [nombre, setNombre] = useState(propuesta.nombreReceptor ?? "");
  const [descripcion, setDescripcion] = useState(propuesta.descripcionServicio ?? "");
  const [aprenderPatron, setAprenderPatron] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [marcando, setMarcando] = useState(false);

  const motivo = motivoCorto(propuesta.motivoRevision);
  const esUmbral = (propuesta.motivoRevision ?? "").includes("umbral");
  const validacion = validarDocEnVivo(docTipo, docNro);
  const ocupado = guardando || marcando;

  async function guardarYEmitir() {
    setGuardando(true);
    try {
      const res = await completarRevisionAction(propuesta.id, {
        docTipo,
        // Consumidor final (99) va con documento "0" — si quedó algo tipeado de
        // antes de cambiar el tipo, no se manda.
        docNro: docTipo === 99 ? "0" : docNro,
        nombreReceptor: nombre,
        descripcionServicio: descripcion,
      });
      if (res.ok) {
        showSuccess("Listo: la venta pasó a la cola de emisión.");
        onResuelta(propuesta.id);
        router.refresh();
      } else {
        showError(res.error);
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "No se pudo guardar la revisión.");
    } finally {
      setGuardando(false);
    }
  }

  async function noFacturable() {
    setMarcando(true);
    try {
      const res = await marcarNoFacturableAction(propuesta.id, aprenderPatron);
      if (res.ok) {
        showSuccess(
          aprenderPatron
            ? "Marcada como no facturable — la próxima importación reconoce este patrón sola."
            : "Marcada como no facturable.",
        );
        onResuelta(propuesta.id);
        router.refresh();
      } else {
        showError(res.error);
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "No se pudo marcar el movimiento.");
    } finally {
      setMarcando(false);
    }
  }

  const seg = (id: "movimiento" | "emision", label: string) => (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={tab === id}
      aria-controls={`panel-${id}`}
      onClick={() => setTab(id)}
      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
        tab === id ? "bg-surface-raised font-semibold text-strong shadow-xs" : "text-muted hover:text-strong"
      }`}
    >
      {label}
    </button>
  );

  const kv = (k: string, v: React.ReactNode) => (
    <li className="flex items-start justify-between gap-3 border-b border-line py-2 text-sm last:border-b-0">
      <span className="shrink-0 text-muted">{k}</span>
      <span className="min-w-0 break-words text-right font-medium tabular-nums text-strong">{v}</span>
    </li>
  );

  return (
    <div className="rounded-lg border border-line bg-surface-raised p-5 shadow-card xl:sticky xl:top-6">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold tracking-wide text-muted">
        <span className="tabular-nums">{fechaAr(propuesta.fecha)}</span>
        <Badge tone={motivo.tone} dot>{motivo.label}</Badge>
      </div>
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="break-words text-base font-bold tracking-tight text-strong outline-none line-clamp-2"
      >
        {propuesta.descripcion}
      </h3>
      <p className="mb-4 mt-0.5 text-lg font-bold tabular-nums text-strong">
        {fmtMoneyARS(Math.abs(propuesta.monto))}
      </p>

      <div role="tablist" aria-label="Detalle del movimiento" className="mb-4 flex gap-0.5 rounded-lg bg-surface-sunken p-0.5">
        {seg("movimiento", "Movimiento")}
        {seg("emision", "Emisión")}
      </div>

      {tab === "movimiento" ? (
        <div role="tabpanel" id="panel-movimiento" aria-labelledby="tab-movimiento">
          <ul className="mb-2">
            {kv("Fecha", fechaAr(propuesta.fecha))}
            {kv("Monto", fmtMoneyARS(Math.abs(propuesta.monto)))}
            {kv("Contraparte", propuesta.contraparte ?? "—")}
            {kv("Referencia", propuesta.referencia ?? "—")}
            {kv("Clasificación", propuesta.clasificacion)}
          </ul>
          {propuesta.motivoRevision && (
            <p className="rounded-md bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-muted">
              {propuesta.motivoRevision}
            </p>
          )}
        </div>
      ) : (
        <form
          role="tabpanel"
          id="panel-emision"
          aria-labelledby="tab-emision"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void guardarYEmitir();
          }}
        >
          {esUmbral && (
            <p className="rounded-md bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning">
              Esta venta supera el umbral de identificación: para facturarla hacen falta los datos
              del comprador.
            </p>
          )}
          <Field label="Tipo de documento" htmlFor={`doc-tipo-${propuesta.id}`}>
            <select
              id={`doc-tipo-${propuesta.id}`}
              value={docTipo}
              onChange={(e) => setDocTipo(Number(e.target.value))}
              className="h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 pr-8 text-sm text-strong transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {DOC_TIPOS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
              {/* Confirmar sin identificar solo vale cuando el motivo NO es el umbral
                  (ej. posible duplicado): con umbral, la identificación es la regla. */}
              {!esUmbral && <option value={99}>Consumidor final (solo confirmar)</option>}
            </select>
          </Field>
          <Field
            label="Número de documento"
            htmlFor={`doc-nro-${propuesta.id}`}
            error={validacion.tono === "error" ? validacion.texto : undefined}
            hint={validacion.tono !== "error" ? validacion.texto : undefined}
          >
            <Input
              id={`doc-nro-${propuesta.id}`}
              inputMode="numeric"
              autoComplete="off"
              value={docNro}
              disabled={docTipo === 99}
              onChange={(e) => setDocNro(e.target.value)}
              placeholder={docTipo === 96 ? "12345678" : "20-12345678-3"}
              aria-invalid={validacion.tono === "error"}
              className={validacion.tono === "ok" ? "border-success" : undefined}
            />
          </Field>
          {docTipo !== 99 && (
            <>
              <Field label="Nombre o razón social" htmlFor={`nombre-${propuesta.id}`} required>
                <Input
                  id={`nombre-${propuesta.id}`}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Como figura en el comprobante"
                />
              </Field>
              <Field
                label="Descripción del servicio o venta"
                htmlFor={`desc-${propuesta.id}`}
                required
                hint="Contalo simple: qué se vendió o qué servicio se prestó."
              >
                <Input
                  id={`desc-${propuesta.id}`}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Ej.: servicio de coloración y corte"
                />
              </Field>
            </>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <Button type="submit" disabled={ocupado} className="w-full">
              {guardando ? "Guardando…" : "Guardar y pasar a emitir"}
            </Button>
            <label className="flex min-h-[var(--tap-min)] cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={aprenderPatron}
                onChange={(e) => setAprenderPatron(e.target.checked)}
                className="size-4 rounded border-line-strong accent-[var(--accent)]"
              />
              Recordar este patrón para las próximas importaciones
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={ocupado}
              onClick={() => void noFacturable()}
              className="w-full"
            >
              {marcando ? "Marcando…" : "Marcar no facturable"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Cola completa: tabla + panel ─────────────────────────────────────────────

export default function ColaRevision({ propuestas }: { propuestas: PropuestaVista[] }) {
  const [lista, setLista] = useState(propuestas);
  const [seleccionId, setSeleccionId] = useState<string | null>(propuestas[0]?.id ?? null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const seleccion = lista.find((p) => p.id === seleccionId) ?? lista[0] ?? null;

  function seleccionar(id: string) {
    setSeleccionId(id);
    // Foco gestionado: al elegir una fila, el lector/teclado aterriza en el
    // título del panel (h3 tabIndex=-1) en vez de perderse en la tabla.
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function quitar(id: string) {
    setLista((prev) => {
      const next = prev.filter((p) => p.id !== id);
      const idx = prev.findIndex((p) => p.id === id);
      setSeleccionId(next[Math.min(idx, next.length - 1)]?.id ?? null);
      return next;
    });
  }

  if (lista.length === 0) {
    return (
      <EmptyState
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-5">
            <path d="M9 12l2 2 4-4.5" />
            <circle cx="12" cy="12" r="8.5" />
          </svg>
        }
        title="No hay nada para revisar"
        description="Cuando una venta supere el umbral de identificación o parezca duplicada, va a aparecer acá para que la mires antes de facturar."
      />
    );
  }

  return (
    // Master-detail unificado con CarteraPanel (fixes 3/31): dos columnas
    // recién desde xl (1280px) — en notebooks 13" iba apretado con lg.
    <div className="grid grid-cols-1 items-start gap-md xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="overflow-x-auto rounded-xl border border-line bg-surface-raised shadow-card">
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
          <caption className="sr-only">Ventas pendientes de revisión antes de facturar</caption>
          <thead>
            <tr className="border-b border-line bg-surface-sunken text-[11px] uppercase tracking-[.06em] text-muted">
              <th scope="col" className="px-[22px] py-2.5 font-semibold">Fecha</th>
              <th scope="col" className="px-[22px] py-2.5 font-semibold">Movimiento del banco</th>
              <th scope="col" className="px-[22px] py-2.5 font-semibold">Por qué está acá</th>
              <th scope="col" className="px-[22px] py-2.5 text-right font-semibold">Monto</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const activa = seleccion?.id === p.id;
              const motivo = motivoCorto(p.motivoRevision);
              return (
                <tr
                  key={p.id}
                  onClick={() => seleccionar(p.id)}
                  aria-selected={activa}
                  className={`cursor-pointer border-b border-line transition-colors last:border-b-0 ${
                    activa
                      ? "bg-accent-soft shadow-[inset_2.5px_0_0_var(--accent)]"
                      : "hover:bg-surface-sunken"
                  }`}
                >
                  <td className="whitespace-nowrap px-[22px] py-[13px] tabular-nums text-muted">
                    {fechaAr(p.fecha)}
                  </td>
                  <td className="max-w-64 px-[22px] py-[13px]">
                    {/* Botón real: la selección es alcanzable por teclado, no solo con click. */}
                    <button
                      type="button"
                      onClick={() => seleccionar(p.id)}
                      className="block max-w-full truncate rounded text-left font-medium text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      {p.descripcion}
                    </button>
                    {p.contraparte && (
                      <span className="block truncate text-xs text-muted">{p.contraparte}</span>
                    )}
                  </td>
                  <td className="px-[22px] py-[13px]">
                    <Badge tone={motivo.tone} dot>{motivo.label}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-[22px] py-[13px] text-right font-semibold tabular-nums text-strong">
                    {fmtMoneyARS(Math.abs(p.monto))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {seleccion && (
        <PanelDetalle
          key={seleccion.id}
          propuesta={seleccion}
          headingRef={headingRef}
          onResuelta={quitar}
        />
      )}
    </div>
  );
}
