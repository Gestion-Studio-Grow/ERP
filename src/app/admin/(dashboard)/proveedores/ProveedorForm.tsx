"use client";

// Alta y edición de un proveedor, y su baja lógica. Client component sin imports de servidor:
// las acciones llegan como referencias de "use server". Los errores vuelven como texto y se
// muestran arriba del formulario, sin perder lo cargado: se envía con `useEnvio` (onSubmit) y
// no con `<form action>`, porque con action React vaciaba los campos también cuando la acción
// volvía con error ("Ese CUIT no existe" dejaba el alta en blanco).

import { AvisoError, Input, Textarea, buttonClasses } from "@/components/ui";
import { useEnvio } from "@/lib/inventario/envio";
import {
  cambiarEstadoProveedor,
  crearProveedor,
  editarProveedor,
  type EstadoProveedor,
} from "./actions";

type Datos = { id?: string; name?: string; taxId?: string | null; email?: string | null; phone?: string | null; notes?: string | null };

function Guardar({ texto, enviando, variante = "solid" }: { texto: string; enviando: boolean; variante?: "solid" | "outline" }) {
  return (
    <button type="submit" disabled={enviando} className={buttonClasses(variante, "md")}>
      {enviando ? "Guardando…" : texto}
    </button>
  );
}

function Aviso({ estado }: { estado: EstadoProveedor }) {
  if (!estado) return null;
  if (!estado.ok) return <AvisoError titulo="No se guardó" comoSeguir={estado.error} />;
  return (
    <p role="status" className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-strong">
      {estado.mensaje}
    </p>
  );
}

export function ProveedorForm({ modo, datos = {} }: { modo: "alta" | "edicion"; datos?: Datos }) {
  const { estado, enviar, enviando } = useEnvio<EstadoProveedor>(modo === "alta" ? crearProveedor : editarProveedor, null);
  const campo = (id: string) => `${modo}-${id}`;
  return (
    <form onSubmit={enviar} className="space-y-3">
      <Aviso estado={estado} />
      {datos.id && <input type="hidden" name="id" value={datos.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm" htmlFor={campo("name")}>
          <span className="mb-1 block text-muted">Razón social o nombre</span>
          <Input id={campo("name")} name="name" required defaultValue={datos.name ?? ""} placeholder="Ej.: Frigorífico del Sur S.A." />
        </label>
        <label className="text-sm" htmlFor={campo("taxId")}>
          <span className="mb-1 block text-muted">CUIT (opcional)</span>
          <Input
            id={campo("taxId")}
            name="taxId"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={datos.taxId ?? ""}
            placeholder="30-71234567-1"
          />
        </label>
        <label className="text-sm" htmlFor={campo("phone")}>
          <span className="mb-1 block text-muted">Teléfono o WhatsApp</span>
          <Input id={campo("phone")} name="phone" type="tel" inputMode="tel" defaultValue={datos.phone ?? ""} />
        </label>
        <label className="text-sm" htmlFor={campo("email")}>
          <span className="mb-1 block text-muted">Email</span>
          <Input id={campo("email")} name="email" type="email" defaultValue={datos.email ?? ""} />
        </label>
      </div>
      <label className="block text-sm" htmlFor={campo("notes")}>
        <span className="mb-1 block text-muted">Notas</span>
        <Textarea id={campo("notes")} name="notes" rows={2} defaultValue={datos.notes ?? ""} placeholder="Ej.: entrega martes y viernes, pedir con 48 h" />
      </label>
      <Guardar texto={modo === "alta" ? "Dar de alta" : "Guardar cambios"} enviando={enviando} />
    </form>
  );
}

export function EstadoProveedorForm({ id, activo }: { id: string; activo: boolean }) {
  const { estado, enviar, enviando } = useEnvio<EstadoProveedor>(cambiarEstadoProveedor, null);
  return (
    <form onSubmit={enviar} className="space-y-2">
      <Aviso estado={estado} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="activo" value={activo ? "0" : "1"} />
      <Guardar texto={activo ? "Dar de baja" : "Reactivar"} enviando={enviando} variante="outline" />
    </form>
  );
}
