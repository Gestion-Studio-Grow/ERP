"use client";

// «Cerrar sesión», con lo que la pestaña guarda de quien se va. Hoy: el cobro sin confirmar de
// Vender (cobro-sin-conexion.ts), que lleva lo cargado y el cliente. Si la sesión se cierra, la
// próxima persona en esta pestaña no lo tiene que ver ni restaurar. El borrado va ANTES de la
// action (`onSubmit` corre primero) y no puede frenarla: si el almacén no se puede tocar, se
// cierra sesión igual.

import type { ReactNode } from "react";
import { logout } from "@/lib/auth-actions";
import { borrarCobrosSinConfirmarDeLaPestana } from "./(dashboard)/vender/cobro-sin-conexion";

export default function FormCerrarSesion({ children }: { children: ReactNode }) {
  return (
    <form action={logout} onSubmit={() => borrarCobrosSinConfirmarDeLaPestana()}>
      {children}
    </form>
  );
}
