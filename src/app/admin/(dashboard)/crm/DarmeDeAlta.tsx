"use client";

// CRM COMERCIAL · arranque: la dueña del negocio se da de alta en Dirección si todavía no hay nadie
// (repo.guardarMiembro lo permite sólo en ese caso; cualquier otro intento lo rechaza el servidor).

import { Button } from "@/components/ui";
import { guardarMiembroCrm } from "@/lib/crm-comercial/acciones";
import { Resultado } from "./Avisos";
import { useAccion } from "./useAccion";

export function DarmeDeAlta({ userId }: { userId: string }) {
  const { correr, pendiente, motivo } = useAccion();
  return (
    <div>
      <Button size="sm" disabled={pendiente} onClick={() => correr(() => guardarMiembroCrm({ userId, rol: "DIRECCION" }))}>
        {pendiente ? "Dando de alta…" : "Darme de alta en Dirección"}
      </Button>
      <Resultado motivo={motivo} />
    </div>
  );
}
