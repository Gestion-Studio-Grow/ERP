"use client";

// «Pedir a Soporte GSG» en la ficha del cliente (GSG-22 y los «sin dirección»). Un renglón por
// pedido que aplica (pedidosDeLaFicha): el motivo y UNA tecla. La corrección del CUIT pide el CUIT
// correcto antes de mandar; un pedido ya hecho se marca con su fecha en vez de repetirse.
// El permiso y la pertenencia a la cartera los vuelve a mirar pedirASoporteAction.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bloque, Button, Franja, Input, Marca, Renglon } from "@/components/ui";
import { fechaCorta } from "@/lib/cierre-mes/cierre-mes";
import { pedirASoporteAction } from "./pedido-soporte-actions";
import { TEXTO_PEDIDO, TEXTO_RESULTADO, type PedidoDeLaFicha } from "./pedido-soporte";

export default function PedirASoporte({
  clienteTenantId,
  alias,
  pedidos,
}: {
  clienteTenantId: string;
  alias: string;
  pedidos: PedidoDeLaFicha[];
}) {
  const router = useRouter();
  const [abiertoCuit, setAbiertoCuit] = useState(false);
  const [cuit, setCuit] = useState("");
  const [nota, setNota] = useState("");
  const [mensaje, setMensaje] = useState<{ tono: "info" | "peligro"; texto: string } | null>(null);
  const [pendiente, startTransition] = useTransition();

  if (pedidos.length === 0) return null;

  const pedir = (tipo: PedidoDeLaFicha["tipo"]) => {
    setMensaje(null);
    startTransition(async () => {
      const r = await pedirASoporteAction({
        cliente: clienteTenantId,
        tipo,
        ...(tipo === "corregir_cuit" ? { cuit, nota } : {}),
      });
      if (r.ok) {
        setMensaje({ tono: "info", texto: r.mensaje });
        setAbiertoCuit(false);
        setCuit("");
        setNota("");
        router.refresh();
      } else {
        setMensaje({ tono: "peligro", texto: r.error });
      }
    });
  };

  return (
    <Bloque id="pedir-soporte" titulo="Pedir a Soporte GSG" nota={`Lo que no podés cambiar vos en ${alias}`} className="mt-6">
      {pedidos.map((p) => (
        <Renglon
          key={p.tipo}
          folio={p.pedidoEl ? <Marca tipo="pendiente">Pedido</Marca> : p.urgente ? <Marca tipo="atencion">Falta</Marca> : undefined}
          titulo={TEXTO_PEDIDO[p.tipo].pedido}
          detalle={
            p.pedidoEl ? (
              `Pedido a Soporte GSG el ${fechaCorta(new Date(p.pedidoEl))}: está en su bandeja de pedidos. Queda acá hasta que lo resuelvan.`
            ) : p.respuesta ? (
              <>
                {p.motivo}{" "}
                <span className="text-strong">
                  Soporte GSG contestó el {fechaCorta(new Date(p.respuesta.resueltoEl))}: {TEXTO_RESULTADO[p.respuesta.resultado].toLowerCase()}
                  {p.respuesta.respuesta ? ` («${p.respuesta.respuesta}»)` : ""}. Si sigue igual, pedilo de nuevo.
                </span>
              </>
            ) : (
              p.motivo
            )
          }
          tecla={
            p.pedidoEl ? null : p.tipo === "corregir_cuit" ? (
              <Button size="sm" variant="outline" aria-expanded={abiertoCuit} onClick={() => setAbiertoCuit((v) => !v)}>
                {abiertoCuit ? "Cerrar" : "Pedir"}
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={pendiente} onClick={() => pedir(p.tipo)}>
                {pendiente ? "Pidiendo…" : "Pedir"}
              </Button>
            )
          }
        />
      ))}
      {abiertoCuit && (
        <form
          className="grid gap-3 border-b border-line py-3"
          onSubmit={(e) => {
            e.preventDefault();
            pedir("corregir_cuit");
          }}
        >
          <label className="grid gap-1 text-[13px] text-strong">
            CUIT correcto (el de su constancia de inscripción en ARCA)
            <Input
              value={cuit}
              onChange={(e) => setCuit(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="20-12345678-9"
              maxLength={13}
              required
              className="min-h-11"
            />
          </label>
          <label className="grid gap-1 text-[13px] text-strong">
            Aclaración para Soporte (opcional)
            <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Ej.: cambió de monotributo a responsable inscripto" className="min-h-11" />
          </label>
          <span>
            <Button type="submit" size="md" disabled={pendiente}>
              {pendiente ? "Enviando…" : TEXTO_PEDIDO.corregir_cuit.boton}
            </Button>
          </span>
        </form>
      )}
      <div aria-live="polite">
        {mensaje && (
          <Franja tono={mensaje.tono} className="mt-3">
            <span role={mensaje.tono === "peligro" ? "alert" : undefined}>{mensaje.texto}</span>
          </Franja>
        )}
      </div>
    </Bloque>
  );
}
