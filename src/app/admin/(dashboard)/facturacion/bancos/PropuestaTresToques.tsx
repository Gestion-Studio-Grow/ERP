"use client";

// ============================================================================
// Una propuesta en TRES toques (diseño «Renglón»): evolución de EmitirDeslizando para UNA.
// ============================================================================
//
//   1.º toque: el renglón se abre y dice qué se va a emitir, a quién y por cuánto.
//   2.º toque: «Emitir esta factura» (o «No es una venta»).
//   3.º gesto: deslizar para confirmar — emitir no tiene vuelta atrás (se corrige con nota de
//      crédito), así que la confirmación es la perilla de la casa, con el importe escrito.
//
// Habla con el motor por `acciones` (las de propuestas-adaptador.ts, por props): en el navegador
// se prueba con dobles, sin servidor. Bancos y Mercado Pago comparten esta bandeja.

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DeslizarParaConfirmar } from "@/components/ui/Deslizar";
import { Button, Marca, fmtMoneyARS } from "@/components/ui";
import type { ResultadoEmision } from "@/lib/bancos-glue";
import { fechaAr } from "./helpers";
import type {
  AccionesPropuestas,
  PropuestaVista,
} from "./propuestas-adaptador";

type Paso = "cerrado" | "abierto" | "confirmar" | "listo";

function receptor(p: PropuestaVista): string {
  if (p.docNro)
    return `${p.nombreReceptor?.trim() || "Comprador identificado"} (${p.docNro})`;
  return "Consumidor final";
}

function textoResultado(r: ResultadoEmision): {
  tono: "ok" | "error";
  texto: string;
} {
  if (r.emitidas > 0) return { tono: "ok", texto: "Factura emitida." };
  if ((r.yaFacturadas ?? 0) > 0)
    return {
      tono: "ok",
      texto: "Ese cobro ya estaba facturado: quedó atado a esa factura.",
    };
  if (r.capAlcanzado || r.bloqueadasPorCap > 0)
    return {
      tono: "error",
      texto: r.mensaje ?? "Se alcanzó el límite de facturas del plan.",
    };
  return {
    tono: "error",
    texto:
      r.errores[0]?.error ??
      r.mensaje ??
      "No se pudo emitir. Probá de nuevo en un rato.",
  };
}

export default function PropuestaTresToques({
  p,
  modoPrueba,
  acciones,
}: {
  p: PropuestaVista;
  modoPrueba: boolean;
  /** `accionesPropuestas` (propuestas-adaptador.ts) en la pantalla; dobles en la prueba. */
  acciones: AccionesPropuestas;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>("cerrado");
  const [aviso, setAviso] = useState<{
    tono: "ok" | "error";
    texto: string;
  } | null>(null);
  const [intento, setIntento] = useState(0);
  const [pendiente, startTransition] = useTransition();
  const id = useId();
  const importe = fmtMoneyARS(Math.abs(p.monto));

  const correr = (fn: () => Promise<{ tono: "ok" | "error"; texto: string }>) =>
    startTransition(async () => {
      try {
        const a = await fn();
        setAviso(a);
        setPaso(a.tono === "ok" ? "listo" : "abierto");
        if (a.tono === "ok") router.refresh();
      } catch {
        // Sin respuesta: puede haberse emitido. No se reintenta solo (la acción es idempotente por cobro).
        setAviso({
          tono: "error",
          texto:
            "No llegó la respuesta. Actualizá la página antes de volver a intentar.",
        });
        setPaso("abierto");
      }
      setIntento((n) => n + 1);
    });

  return (
    <div
      data-ui="propuesta"
      data-paso={paso}
      className="border-b border-line-soft py-2"
    >
      <button
        type="button"
        aria-expanded={paso !== "cerrado"}
        aria-controls={`${id}-detalle`}
        onClick={() =>
          setPaso((s) =>
            s === "cerrado" ? "abierto" : s === "listo" ? s : "cerrado",
          )
        }
        className="flex min-h-11 w-full items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <span className="w-12 shrink-0 text-sm tabular-nums text-muted">
          {fechaAr(p.fecha).slice(0, 5)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-strong">
            {p.descripcion}
          </span>
          <span className="block truncate text-xs text-muted">
            {p.origen === "mercadopago" ? "Mercado Pago" : "Banco"}
            {p.contraparte ? ` · ${p.contraparte}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-strong">
          {importe}
        </span>
      </button>

      {paso !== "cerrado" && (
        <div id={`${id}-detalle`} className="flex flex-col gap-3 pb-2 pt-3">
          {paso !== "listo" && (
            <p className="text-sm text-body">
              Factura a{" "}
              <strong className="font-semibold text-strong">
                {receptor(p)}
              </strong>{" "}
              por{" "}
              <strong className="font-semibold tabular-nums text-strong">
                {importe}
              </strong>
              {p.descripcionServicio ? <> · {p.descripcionServicio}</> : null}.
              {modoPrueba
                ? " ARCA todavía no factura con validez fiscal: sale de prueba."
                : " Una vez emitida, se corrige con nota de crédito."}
            </p>
          )}

          {paso === "abierto" && (
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => setPaso("confirmar")}
                disabled={pendiente}
              >
                Emitir esta factura
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pendiente}
                onClick={() =>
                  correr(async () => {
                    const r = await acciones.noEsVenta(p.id);
                    return r.ok
                      ? { tono: "ok", texto: "Marcada como no facturable." }
                      : { tono: "error", texto: r.error };
                  })
                }
              >
                No es una venta
              </Button>
            </div>
          )}

          {paso === "confirmar" && (
            <div className="flex max-w-xl flex-col gap-2">
              <DeslizarParaConfirmar
                key={intento}
                texto={`Deslizá para emitir ${importe}`}
                etiqueta={`Emitir la factura por ${importe}`}
                textoHecho="Emitiendo…"
                disabled={pendiente}
                onConfirmar={() =>
                  correr(async () =>
                    textoResultado(await acciones.emitir([p.id])),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPaso("abierto")}
                disabled={pendiente}
                className="self-start"
              >
                Mejor no
              </Button>
            </div>
          )}

          {aviso && (
            <p
              role={aviso.tono === "error" ? "alert" : "status"}
              className={`text-sm font-medium ${aviso.tono === "ok" ? "text-success" : "text-danger"}`}
            >
              {aviso.tono === "ok" ? (
                <Marca tipo="hecho">{aviso.texto}</Marca>
              ) : (
                aviso.texto
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
