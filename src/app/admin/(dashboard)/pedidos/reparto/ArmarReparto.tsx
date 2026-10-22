"use client";

// ============================================================================
// ARMAR REPARTO — la hoja del cadete de una franja (Magra, tanda 2 · 2C · MG-055).
// ============================================================================
//
// La lista ordenada por zona (el recorrido del dueño), con dirección, lo que lleva y «Cobrar $X /
// Ya pagó». Tres salidas: imprimirla (un documento aparte, blanco y negro, con casillas), mandarla
// por WhatsApp al cadete (el texto ya armado, desde el teléfono de quien atiende) y «Salió el
// cadete», que marca los envíos en la calle para rendirlos a la vuelta. Nada se cobra acá.

import { useId, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { textoPlata } from "@/lib/cobro/pie-de-cobro-core";
import { useToast } from "../../ToastProvider";
import { esRedirectDeNext } from "../formularios-del-pedido";
import { cobroDelEnvio, hojaImprimible, textoParaElCadete, waDelCadete, type HojaDelReparto } from "./reparto-core";
import { salioElReparto } from "./acciones";

/** El cadete de siempre, recordado en ESTE navegador (comodidad: si se pierde, se vuelve a escribir). */
const CLAVE_CADETE = "gsg:reparto:cadete";

const AVISO_CADETE = "gsg:reparto:cadete-cambio";

function leerGuardado(): string {
  try {
    return window.localStorage.getItem(CLAVE_CADETE) ?? "";
  } catch {
    return "";
  }
}

function suscribir(avisar: () => void): () => void {
  window.addEventListener("storage", avisar);
  window.addEventListener(AVISO_CADETE, avisar);
  return () => {
    window.removeEventListener("storage", avisar);
    window.removeEventListener(AVISO_CADETE, avisar);
  };
}

function leerCadete(crudo: string): { nombre: string; telefono: string } {
  try {
    const v = JSON.parse(crudo || "null") as { nombre?: unknown; telefono?: unknown } | null;
    return { nombre: typeof v?.nombre === "string" ? v.nombre : "", telefono: typeof v?.telefono === "string" ? v.telefono : "" };
  } catch {
    return { nombre: "", telefono: "" };
  }
}

function guardarCadete(c: { nombre: string; telefono: string }) {
  try {
    window.localStorage.setItem(CLAVE_CADETE, JSON.stringify(c));
  } catch {
    /* sin almacenamiento: se escribe cada vez */
  }
  window.dispatchEvent(new Event(AVISO_CADETE));
}

let marco: HTMLIFrameElement | null = null;

/** Imprime la hoja en un iframe invisible (no imprime el panel entero ni deja basura). */
function imprimir(html: string) {
  if (!marco || !marco.isConnected) {
    marco = document.createElement("iframe");
    marco.setAttribute("aria-hidden", "true");
    marco.tabIndex = -1;
    Object.assign(marco.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
    document.body.appendChild(marco);
  }
  const f = marco;
  f.onload = () => {
    f.contentWindow?.focus();
    f.contentWindow?.print();
  };
  f.srcdoc = html;
}

export default function ArmarReparto({
  hoja,
  franja,
  dia,
  negocio,
  puedeOperar,
}: {
  hoja: HojaDelReparto;
  franja: string;
  dia: string;
  negocio: string;
  puedeOperar: boolean;
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const uid = useId();
  // Lo escrito vive en este navegador (localStorage); en el servidor y sin almacenamiento, vacío.
  const guardado = useSyncExternalStore(suscribir, leerGuardado, () => "");
  const [escrito, setEscrito] = useState<{ nombre: string; telefono: string } | null>(null);
  const cadete = escrito ?? leerCadete(guardado);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const aSalir = hoja.grupos.flatMap((g) => g.envios).filter((e) => !e.salida);
  const yaSalieron = hoja.envios - aSalir.length;
  const texto = textoParaElCadete(hoja, { negocio, dia, franja });
  const cambiarCadete = (c: { nombre: string; telefono: string }) => {
    setEscrito(c);
    guardarCadete(c);
  };

  function salio() {
    const fd = new FormData();
    for (const e of aSalir) fd.append("id", e.id);
    fd.set("franja", franja);
    if (cadete.nombre.trim()) fd.set("cadete", cadete.nombre.trim());
    startTransition(async () => {
      let r;
      try {
        r = await salioElReparto(fd);
      } catch (e) {
        if (esRedirectDeNext(e)) throw e;
        const msg = "No se pudo marcar la salida. Revisá la conexión y volvé a tocar: lo que ya salió no se marca dos veces.";
        setError(msg);
        showError(msg);
        return;
      }
      if (!r.ok) {
        setError(r.error);
        showError(r.error);
        router.refresh();
        return;
      }
      setError(null);
      showSuccess(r.mensaje);
      router.refresh();
    });
  }

  return (
    <section aria-label={`Reparto ${franja}`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-lg border border-line bg-surface-raised p-4">
        <p className="text-body">
          <strong className="text-strong">{hoja.envios === 1 ? "1 envío listo" : `${hoja.envios} envíos listos`}</strong>
          {yaSalieron > 0 && <span className="text-muted"> · {yaSalieron} ya en la calle</span>}
        </p>
        <p className="flex items-baseline gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Cobrar en la calle</span>
          <span className="font-display text-3xl leading-none tabular-nums text-strong">{textoPlata(hoja.aCobrar)}</span>
        </p>
      </div>

      {hoja.sinTerminar.length > 0 && (
        <p role="status" className="rounded-lg border border-line bg-surface-sunken p-3 text-sm text-body">
          <strong className="text-warning">Faltan terminar {hoja.sinTerminar.length}:</strong>{" "}
          {hoja.sinTerminar.map((e, i) => (
            <span key={e.id}>
              {i > 0 && ", "}
              <Link href={`/admin/pedidos/${e.code}/armar`} className="font-medium text-accent-ink underline underline-offset-4">
                #{e.code} {e.cliente}
              </Link>
            </span>
          ))}
          . No salen hasta que estén listos.
        </p>
      )}

      {hoja.envios === 0 ? (
        <p role="status" className="rounded-lg border border-line bg-surface-raised p-4 text-body">
          Todavía no hay envíos listos en esta franja.
        </p>
      ) : (
        <ol className="flex flex-col gap-4" aria-label="Envíos por zona">
          {hoja.grupos.map((g) => (
            <li key={g.zona}>
              <h2 className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-line-strong pb-1">
                <span className="text-sm font-semibold uppercase tracking-wide text-strong">{g.zona}</span>
                <span className="text-sm text-muted tabular-nums">
                  {g.envios.length === 1 ? "1 envío" : `${g.envios.length} envíos`}
                  {g.aCobrar > 0 && ` · cobrar ${textoPlata(g.aCobrar)}`}
                </span>
              </h2>
              <ul className="flex flex-col divide-y divide-line">
                {g.envios.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-strong">
                        #{e.code} · {e.cliente}
                        {e.telefono && <span className="font-normal text-muted"> · {e.telefono}</span>}
                      </p>
                      <p className="text-body">{e.direccion ?? <span className="text-warning">Sin dirección: llamala antes de salir</span>}</p>
                      {e.resumen && <p className="text-sm text-muted">{e.resumen}</p>}
                      {e.nota && <p className="text-sm text-muted">Nota: {e.nota}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      <span className={`font-semibold tabular-nums ${e.cobrado ? "text-success" : "text-strong"}`}>{cobroDelEnvio(e)}</span>
                      {e.salida && <span className="text-xs text-muted">En la calle desde {e.salida.desde}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {hoja.envios > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-sunken p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cadete" htmlFor={`${uid}-nombre`}>
              <Input
                id={`${uid}-nombre`}
                value={cadete.nombre}
                maxLength={60}
                autoComplete="off"
                placeholder="Nombre (opcional)"
                onChange={(e) => cambiarCadete({ ...cadete, nombre: e.target.value })}
              />
            </Field>
            <Field label="WhatsApp del cadete" htmlFor={`${uid}-tel`}>
              <Input
                id={`${uid}-tel`}
                type="tel"
                inputMode="tel"
                value={cadete.telefono}
                maxLength={30}
                autoComplete="off"
                placeholder="11 5555-0000 (opcional)"
                onChange={(e) => cambiarCadete({ ...cadete, telefono: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={waDelCadete(cadete.telefono, texto)}
              target="_blank"
              rel="noopener noreferrer"
              data-ui="button"
              data-variant="outline"
              className="inline-flex min-h-11 items-center rounded-md border border-line-strong px-4 text-sm font-semibold text-strong hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Mandar al cadete por WhatsApp
            </a>
            <Button
              type="button"
              variant="outline"
              onClick={() => imprimir(hojaImprimible(hoja, { negocio, dia, franja, cadete: cadete.nombre.trim() || null }))}
            >
              Imprimir la hoja
            </Button>
            {puedeOperar && (
              <Button
                type="button"
                disabled={pending || aSalir.length === 0}
                estado={pending ? "cargando" : undefined}
                onClick={() => !pending && salio()}
              >
                {aSalir.length === 0
                  ? "Ya salieron todos"
                  : pending
                    ? "Marcando…"
                    : `Salió el cadete · ${aSalir.length === 1 ? "1 envío" : `${aSalir.length} envíos`}`}
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
