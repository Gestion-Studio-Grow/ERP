"use client";

// ============================================================================
// MODAL — el diálogo centrado genérico del kit.
// ============================================================================
//
// Es el mismo <dialog> nativo del `Dialogo` de Cajon.tsx (showModal: foco atrapado y devuelto al
// cerrar, Escape y el velo cierran, entrada por CSS con `@starting-style` en la piel, que ya
// contempla `prefers-reduced-motion`). No duplica la mecánica: la reusa con nombres de la casa.

import { Dialogo } from "./Cajon";

export type ModalProps = {
  abierto: boolean;
  onCerrar: () => void;
  titulo: React.ReactNode;
  /** Una línea debajo del título. */
  descripcion?: React.ReactNode;
  children?: React.ReactNode;
  /** Las teclas de abajo; la principal a la derecha. */
  pie?: React.ReactNode;
  className?: string;
};

/** Diálogo centrado, accesible, sobre <dialog> nativo. */
export function Modal({ children, ...props }: ModalProps) {
  return <Dialogo {...props}>{children}</Dialogo>;
}
