"use client";
// Piezas del asistente ARCA que necesitan el navegador: copiar el pedido de certificado con un toque
// (en el celular se pega en ARCA) y revisar al instante lo que se pega o sube como certificado. La
// validación de verdad la hace el servidor; esto sólo avisa lo obvio, en criollo.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { revisarArchivoCertificado, revisarCertificadoPegado, type RevisionCertificado } from "@/lib/fiscal/certificado-pegado";

export function CopiarTexto({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [estado, setEstado] = useState<"" | "ok" | "error">("");
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(texto);
            setEstado("ok");
            setTimeout(() => setEstado(""), 3000);
          } catch {
            setEstado("error");
          }
        }}
      >
        {etiqueta}
      </Button>
      <span role="status" aria-live="polite" className="text-sm text-muted">
        {estado === "ok" ? "Copiado: ya lo podés pegar en ARCA." : estado === "error" ? "No se pudo copiar: bajá el archivo." : ""}
      </span>
    </span>
  );
}

function Mensaje({ id, r }: { id: string; r: RevisionCertificado }) {
  return (
    <p id={id} role="status" aria-live="polite" className={r.ok === false ? "text-sm text-danger" : "text-sm text-success"}>
      {r.ok === false ? r.motivo : r.ok ? "Se ve bien. Tocá «Guardar el certificado»." : ""}
    </p>
  );
}

/** «Reintentar»: vuelve a pedirle la vista al servidor (sin perder la dirección ni la pestaña). */
export function Reintentar() {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  return (
    <Button type="button" variant="outline" disabled={pendiente} onClick={() => startTransition(() => router.refresh())}>
      {pendiente ? "Reintentando…" : "Reintentar"}
    </Button>
  );
}

/** Pegar el certificado o subir el archivo, con aviso inmediato. Los nombres de campo son los del servidor. */
export function CampoCertificado() {
  const [pegado, setPegado] = useState<RevisionCertificado>({ ok: null });
  const [archivo, setArchivo] = useState<RevisionCertificado>({ ok: null });
  return (
    <>
      <Field label="Pegá el certificado que te dio ARCA" htmlFor="asistente-cert">
        <Textarea
          id="asistente-cert"
          name="certPem"
          rows={4}
          placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
          className="font-mono text-xs"
          aria-describedby="asistente-cert-revision"
          aria-invalid={pegado.ok === false || undefined}
          onChange={(e) => setPegado(revisarCertificadoPegado(e.target.value))}
        />
      </Field>
      <Mensaje id="asistente-cert-revision" r={pegado} />
      <Field label="O subí el archivo que bajaste de ARCA (termina en .crt)" htmlFor="asistente-cert-archivo">
        <Input
          id="asistente-cert-archivo"
          name="certArchivo"
          type="file"
          accept=".crt,.cer,.pem,.txt"
          aria-describedby="asistente-cert-archivo-revision"
          aria-invalid={archivo.ok === false || undefined}
          onChange={(e) => {
            const f = e.target.files?.[0];
            setArchivo(f ? revisarArchivoCertificado(f.name, f.size) : { ok: null });
          }}
        />
      </Field>
      <Mensaje id="asistente-cert-archivo-revision" r={archivo} />
    </>
  );
}
