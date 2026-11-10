"use client";

// ============================================================================
// CONFIRMAR — el reemplazo del confirm() del navegador, sobre Modal.
// ============================================================================
//
// API de promesa para que el lugar que llama cambie poco:
//
//   const { confirmar, dialogo } = useConfirmar();
//   if (!(await confirmar({ titulo, detalle, accion: "Sí, eliminar", peligro: true }))) return;
//   …y `{dialogo}` en el JSX del componente. En un <form action>: `onSubmit={confirmarEnvio({…})}`.
//
// Con el verbo en el botón («Sí, eliminar», nunca «Aceptar») y la salida a la izquierda
// («No, dejarlo»), igual que el diálogo de eliminar de CatalogoRenglon. Cerrar con Escape, el velo o
// la cruz cuenta como «no». En lo peligroso el foco arranca en la salida, no en el borrado.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

export type PedidoConfirmar = {
  titulo: React.ReactNode;
  /** Lo que pasa de verdad si se confirma. */
  detalle?: React.ReactNode;
  /** El verbo del botón principal. Por defecto «Sí, seguir». */
  accion?: string;
  /** El botón de salida. Por defecto «No, dejarlo». */
  cancelar?: string;
  /** Lo irreversible: el botón principal va en rojo. */
  peligro?: boolean;
};

export function useConfirmar() {
  const [pedido, setPedido] = useState<PedidoConfirmar | null>(null);
  const resolver = useRef<((si: boolean) => void) | null>(null);

  const cerrar = useCallback((si: boolean) => {
    resolver.current?.(si);
    resolver.current = null;
    setPedido(null);
  }, []);

  const confirmar = useCallback((p: PedidoConfirmar) => {
    // Si había uno abierto, ése se da por cancelado.
    resolver.current?.(false);
    setPedido(p);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  // Para un <form action={…}>: el onSubmit frena el envío, pregunta y, si es que sí, lo vuelve a
  // mandar con requestSubmit() dejándolo pasar una sola vez. La acción queda sin pregunta adentro
  // (preguntar dentro de la acción la dejaría colgada en la transición).
  const pasa = useRef<HTMLFormElement | null>(null);
  const confirmarEnvio = useCallback(
    (p: PedidoConfirmar) => async (e: React.FormEvent<HTMLFormElement>) => {
      const form = e.currentTarget;
      if (pasa.current === form) {
        pasa.current = null;
        return;
      }
      e.preventDefault();
      if (await confirmar(p)) {
        pasa.current = form;
        form.requestSubmit();
      }
    },
    [confirmar],
  );

  const dialogo = (
    <Confirmar pedido={pedido} onSi={() => cerrar(true)} onNo={() => cerrar(false)} />
  );

  return { confirmar, confirmarEnvio, dialogo };
}

type ConfirmarProps = {
  pedido: PedidoConfirmar | null;
  onSi: () => void;
  onNo: () => void;
};

/** El diálogo de confirmación en sí (controlado). Casi siempre se usa vía `useConfirmar`. */
export function Confirmar({ pedido, onSi, onNo }: ConfirmarProps) {
  // El foco al abrir se pone a mano: los botones ya están montados con el diálogo cerrado, así que
  // `autoFocus` no sirve (corre una sola vez, al montar) y <dialog> enfocaría la cruz. En lo
  // peligroso arranca en la salida: un Enter de más no borra nada.
  const pie = useRef<HTMLDivElement>(null);
  const peligro = pedido?.peligro === true;
  const abierto = pedido !== null;
  useEffect(() => {
    if (!abierto) return;
    pie.current?.querySelector<HTMLButtonElement>(`[data-rol="${peligro ? "no" : "si"}"]`)?.focus();
  }, [abierto, peligro]);
  return (
    <Modal
      abierto={abierto}
      onCerrar={onNo}
      titulo={pedido?.titulo ?? ""}
      pie={
        <div ref={pie} className="contents">
          <Button type="button" variant="ghost" onClick={onNo} data-rol="no">
            {pedido?.cancelar ?? "No, dejarlo"}
          </Button>
          <Button type="button" variant={peligro ? "danger" : "solid"} onClick={onSi} data-rol="si">
            {pedido?.accion ?? "Sí, seguir"}
          </Button>
        </div>
      }
    >
      {pedido?.detalle ? <p className="text-sm text-body">{pedido.detalle}</p> : null}
    </Modal>
  );
}
