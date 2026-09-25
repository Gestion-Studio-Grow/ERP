"use client";

// ============================================================================
// EL PEDIDO ENTERO, en un cajón (diseño nuevo).
// ============================================================================
//
// Se abre tocando el renglón (o Enter con el foco en él) y la lista queda a la vista y en su
// lugar. Arriba, quién y para cuándo; en el medio, lo que lleva con la cuenta a la vista
// (`1,280 kg × $28.600 = $36.608`: el cliente del otro lado del mostrador la puede controlar); al
// pie, la tecla del paso que sigue, al alcance del pulgar. Lo demás (pesar y ajustar, link de
// pago, anular) va en «Más acciones», plegado.
//
// Las acciones son las de siempre: los formularios viejos de pesar y de link de pago (tal cual) y
// los nuevos de cobro y anulación, que mandan los mismos campos (formularios-del-pedido.ts).

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceOrderStatus, registrarAvisoWhatsApp } from "@/lib/order-actions";
import { formatearCantidad } from "@/lib/pos-peso";
import { Cajon } from "@/components/ui/Cajon";
import { Button, Marca, Plata, Renglon, Rotulo } from "@/components/ui";
import { useToast } from "../ToastProvider";
import AjustarPedidoForm from "./AjustarPedidoForm";
import LinkDePagoPedido from "./LinkDePagoPedido";
import CobroDelPedido from "./CobroDelPedido";
import AnularDelPedido from "./AnularDelPedido";
import { rechazoDeAccion, sinRespuestaAlAvanzar } from "./avanzar-pedido";
import { esRedirectDeNext } from "./formularios-del-pedido";
import { quedoElPedido, rielDelPedido, teclaDelPedido, type PedidoDelTablero } from "./pedidos-core";
import type { ExtraDelPedido } from "./tablero.server";

export type SeccionDelCajon = "cobro" | "ajustar" | "link" | "anular" | null;

/** El riel con las palabras de cada paso (en el cajón hay lugar para decirlas). */
function RielConPalabras({ pasos, hechos }: { pasos: readonly string[]; hechos: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]" aria-label={`Paso ${hechos} de ${pasos.length}`}>
      {pasos.map((p, i) => {
        const hecho = i < hechos;
        const actual = i === hechos - 1;
        return (
          <li key={p} className={`inline-flex items-center gap-1.5 ${actual ? "font-semibold text-strong" : hecho ? "text-body" : "text-muted"}`}>
            <Marca tipo={hecho ? "hecho" : "pendiente"} className="font-normal">
              <span className={actual ? "font-semibold" : "font-normal"}>{p}</span>
            </Marca>
            {i < pasos.length - 1 && (
              <span aria-hidden className="text-faint">
                ›
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function AvanzarDelCajon({ pedido }: { pedido: PedidoDelTablero }) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [pending, startTransition] = useTransition();
  const verbo = pedido.verbo!;
  return (
    <Button
      size="lg"
      className="w-full"
      disabled={pending}
      estado={pending ? "cargando" : undefined}
      onClick={() => {
        const fd = new FormData();
        fd.set("id", pedido.id);
        startTransition(async () => {
          let r: unknown;
          try {
            r = await advanceOrderStatus(fd);
          } catch (e) {
            if (esRedirectDeNext(e)) throw e;
            showError(sinRespuestaAlAvanzar(verbo, pedido.code, navigator.onLine));
            return;
          }
          const rechazo = rechazoDeAccion(r);
          if (rechazo) showError(rechazo);
          else showSuccess(quedoElPedido(verbo, pedido.code));
          router.refresh();
        });
      }}
    >
      {verbo}
    </Button>
  );
}

export default function PedidoCajon({
  pedido,
  extra,
  comercio,
  puedeOperar,
  anulacion,
  simulacion,
  seccion,
  onCerrar,
}: {
  pedido: PedidoDelTablero | null;
  extra: ExtraDelPedido | null;
  comercio: boolean;
  puedeOperar: boolean;
  anulacion: { motivoObligatorio: boolean } | null;
  simulacion: boolean;
  seccion: SeccionDelCajon;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const masRef = useRef<HTMLDetailsElement>(null);
  const cobroRef = useRef<HTMLDivElement>(null);
  // Si se abrió desde «Más» (pesar, link, anular) o desde «Cobrar», se va directo a esa parte.
  useEffect(() => {
    if (!pedido || !seccion) return;
    const t = setTimeout(() => {
      if (seccion === "cobro") {
        cobroRef.current?.scrollIntoView({ block: "nearest" });
        cobroRef.current?.querySelector<HTMLInputElement>("input")?.focus();
        return;
      }
      if (masRef.current) masRef.current.open = true;
      const destino = masRef.current?.querySelector<HTMLElement>(`[data-seccion="${seccion}"]`);
      destino?.scrollIntoView({ block: "start" });
      destino?.querySelector<HTMLElement>("button, input")?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [pedido, seccion]);

  if (!pedido) return null;

  const riel = rielDelPedido(pedido, comercio);
  const tecla = teclaDelPedido(pedido);
  // ONLINE = llegó para retirar o enviar (por la tienda o tomado por teléfono): el canal no dice cuál.
  const canal = pedido.canal === "ONLINE" ? "Pedido por la tienda o por teléfono" : "Pedido del mostrador";
  const conMas = puedeOperar && Boolean(extra?.ajustar || extra?.link || anulacion);

  // La tecla del paso que sigue, al pie.
  let pie: React.ReactNode = null;
  if (puedeOperar && tecla) {
    if (tecla.tipo === "avanzar")
      pie = (
        <div className="w-full">
          <AvanzarDelCajon pedido={pedido} />
        </div>
      );
    else if (tecla.tipo === "cobrar")
      pie = (
        <div ref={cobroRef} className="w-full">
          <CobroDelPedido id={pedido.id} code={pedido.code} total={pedido.total} cobrado={pedido.cobrado} modo="cobrar" />
        </div>
      );
    else
      pie = (
        <div ref={cobroRef} className="flex w-full flex-col gap-3">
          {pedido.avisoWa && (
            <a
              href={pedido.avisoWa}
              target="_blank"
              rel="noopener noreferrer"
              data-ui="button"
              data-variant={pedido.avisado ? "ghost" : "outline"}
              data-size="md"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line-strong px-4 text-sm font-medium"
              onClick={() => {
                void registrarAvisoWhatsApp(pedido.id, "pedido-listo")
                  .catch(() => undefined)
                  .finally(() => router.refresh());
              }}
            >
              {pedido.avisado ? `Avisar de nuevo por WhatsApp (avisado ${pedido.avisado})` : "Avisar por WhatsApp que está listo"}
            </a>
          )}
          <CobroDelPedido id={pedido.id} code={pedido.code} total={pedido.total} cobrado={pedido.cobrado} modo="entregar" />
        </div>
      );
  }

  return (
    <Cajon
      abierto
      onCerrar={onCerrar}
      titulo={`Pedido #${pedido.code}`}
      descripcion={`${canal} · ${pedido.cuando}`}
      pie={pie}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <RielConPalabras pasos={riel.pasos} hechos={riel.hechos} />
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Marca tipo={riel.tipo}>{riel.palabra}</Marca>
            {pedido.cobrado ? (
              <Marca tipo="hecho">Cobrado{pedido.medio ? ` · ${pedido.medio}` : ""}</Marca>
            ) : (
              <Marca tipo={pedido.status === "DELIVERED" ? "atencion" : "pendiente"}>A cobrar</Marca>
            )}
          </p>
        </div>

        {/* Adentro del cajón, secciones con su rótulo (no Bloque: ver necesita_fuera del informe). El
            folio del renglón hace de rótulo de la fila: «Cliente», «Retira», «1,28 kg». */}
        <section aria-labelledby="cajon-quien">
          <Rotulo as="h3" className="mb-1">
            <span id="cajon-quien">Para quién</span>
          </Rotulo>
          <Renglon
            folio="Cliente"
            titulo={pedido.cliente}
            detalle={pedido.telefono || "Sin teléfono"}
            tecla={
              extra?.whatsapp ? (
                <a
                  href={extra.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center text-sm font-medium text-accent-ink underline underline-offset-4"
                >
                  Escribirle
                </a>
              ) : undefined
            }
          />
          <Renglon
            folio={pedido.entrega === "DELIVERY" ? "Envío" : "Retira"}
            titulo={pedido.horario?.texto ?? (pedido.entrega === "DELIVERY" ? "Sin horario pedido" : "En el local, sin horario pedido")}
            detalle={
              [pedido.entrega === "DELIVERY" ? pedido.direccion || "Sin dirección cargada" : null, pedido.nota ? `Nota: ${pedido.nota}` : null]
                .filter(Boolean)
                .join(" · ") || undefined
            }
          />
        </section>

        <section aria-labelledby="cajon-lleva">
          <Rotulo as="h3" className="mb-1">
            <span id="cajon-lleva">Lo que lleva</span>
          </Rotulo>
          {pedido.lineas.map((l, i) => (
            <Renglon
              key={i}
              folio={`${formatearCantidad(l.cantidad)} ${l.unidad === "WEIGHT" ? "kg" : "u"}`}
              titulo={
                <>
                  {l.nombre}
                  {l.marca && <span className="font-normal text-muted"> ({l.marca})</span>}
                </>
              }
              detalle={
                <span className="tabular-nums">
                  × <Plata valor={l.precio} /> {l.unidad === "WEIGHT" ? "el kg" : "c/u"}
                </span>
              }
              plata={<Plata valor={l.total} />}
            />
          ))}
          {pedido.descuento > 0 && <Renglon titulo="Descuento" plata={<Plata valor={-pedido.descuento} />} />}
          <Renglon titulo={<strong>Total</strong>} plata={<Plata valor={pedido.total} />} className="border-b-0 border-t-2 border-line-strong font-semibold" />
        </section>

        {conMas && (
          <details ref={masRef} className="group" open={seccion === "ajustar" || seccion === "link" || seccion === "anular"}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between border-b border-line-strong text-[15px] font-semibold text-strong">
              Más acciones
              <span aria-hidden className="text-muted group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="flex flex-col gap-5 pt-4">
              {extra?.ajustar && (
                <section data-seccion="ajustar" aria-label="Pesar y ajustar">
                  <AjustarPedidoForm
                    id={pedido.id}
                    code={pedido.code}
                    subtotal={extra.ajustar.subtotal}
                    descuento={extra.ajustar.descuento}
                    cupon={extra.ajustar.cupon}
                    items={extra.ajustar.items}
                  />
                </section>
              )}
              {extra?.link && (
                <section data-seccion="link" aria-label="Link de pago">
                  <LinkDePagoPedido
                    id={pedido.id}
                    code={pedido.code}
                    total={pedido.total}
                    cobrado={pedido.cobrado}
                    enviado={extra.link.enviado}
                    whatsappEnviado={extra.link.whatsappEnviado}
                    simulacion={simulacion}
                  />
                </section>
              )}
              {/* Listo ya ofrece cobrar al entregar, en el pie: acá sólo antes de estar listo. */}
              {!pedido.cobrado && pedido.status !== "DELIVERED" && pedido.status !== "READY" && (
                <section data-seccion="cobro-anticipado" aria-label="Ya pagó">
                  <p className="mb-2 text-sm text-muted">¿Ya pagó (por ejemplo, por transferencia) y retira más tarde?</p>
                  <CobroDelPedido id={pedido.id} code={pedido.code} total={pedido.total} cobrado={false} modo="cobrar" />
                </section>
              )}
              {anulacion && (
                <section data-seccion="anular" aria-label={`Anular el pedido #${pedido.code}`}>
                  <h3 className="mb-2 text-sm font-semibold text-danger">Anular el pedido</h3>
                  <AnularDelPedido
                    id={pedido.id}
                    code={pedido.code}
                    cobrado={pedido.cobrado}
                    total={pedido.total}
                    motivoObligatorio={anulacion.motivoObligatorio}
                    onHecho={onCerrar}
                  />
                </section>
              )}
            </div>
          </details>
        )}
      </div>
    </Cajon>
  );
}
