"use client";

// El campo WhatsApp de Datos del negocio, con el aviso abajo mientras se escribe: cómo va a quedar
// el número en los links de la tienda y de los pedidos (`avisoWhatsAppDelNegocio`). Antes el
// «11-6677-8890» se guardaba tal cual y el chat del pedido abría un número de EE. UU. sin que el
// dueño se enterara; ahora ve el +54 9 que se le agrega, o que le falta el área.

import { useState } from "react";
import { Input } from "@/components/ui/Field";
import { avisoWhatsAppDelNegocio } from "@/lib/whatsapp-cta";

const COLOR = { ok: "text-muted", aviso: "text-strong", alerta: "text-danger" } as const;

export default function CampoWhatsApp({
  id,
  defaultValue,
  placeholder,
  ayuda,
  claseAyuda,
}: {
  id?: string;
  defaultValue: string;
  placeholder?: string;
  ayuda?: string;
  claseAyuda: string;
}) {
  const [valor, setValor] = useState(defaultValue);
  const aviso = avisoWhatsAppDelNegocio(valor);
  const idAyuda = id ? `${id}-ayuda` : undefined;
  const idAviso = id ? `${id}-aviso` : undefined;
  const describe = [ayuda ? idAyuda : null, aviso ? idAviso : null].filter(Boolean).join(" ") || undefined;
  return (
    <>
      <Input
        id={id}
        name="whatsapp"
        type="tel"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder={placeholder}
        aria-describedby={describe}
        aria-invalid={aviso?.tono === "alerta" || undefined}
      />
      {ayuda && (
        <p id={idAyuda} className={claseAyuda}>
          {ayuda}
        </p>
      )}
      {aviso && (
        <p id={idAviso} role="status" className={`mt-1 text-[13px] ${COLOR[aviso.tono]}`}>
          {aviso.tono === "alerta" ? "⚠ " : ""}
          {aviso.texto}
        </p>
      )}
    </>
  );
}
