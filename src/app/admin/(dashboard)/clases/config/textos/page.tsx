import { redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { gestionaClases } from "@/lib/padel/plata-guardia";
import { badgePendientes, configCompleta } from "@/lib/padel/datos.server";
import { CLAVES_PLANTILLA, PLANTILLAS_DEFAULT, PLANTILLA_LABEL } from "@/lib/padel/core";
import { origen } from "@/lib/padel/acciones-compartido";
import { EncabezadoAjuste } from "../_encabezado";
import { EditorTextos } from "./EditorTextos";
import { datosDeEjemplo } from "./ejemplo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Textos de WhatsApp", manifest: "/clases/app.webmanifest" };

// Ajustes → Textos de WhatsApp (M-084): los mensajes que les llegan a tus alumnos, con vista previa.
// «Lo que te manda el alumno al pedir» va al final: es el único que te llega a vos.
// Los textos los cambia SÓLO el dueño (UAT 11/2026): pueden llevar otro alias escrito. Los demás ven
// la vista previa de cada uno, sin editar.
export default async function AjustesTextos() {
  const user = await requireApp("padel-clases");
  // Todo lo de esta pantalla guarda con acciones que exigen agenda:manage: sin él, vuelve a Hoy.
  if (!gestionaClases(user)) redirect("/admin/clases");
  const esDuenio = user.role === "OWNER";
  const [{ config, negocio }, numero, base] = await Promise.all([configCompleta(), badgePendientes(), origen()]);
  const orden = [...CLAVES_PLANTILLA.filter((k) => k !== "pedidoAlProfe"), "pedidoAlProfe" as const];
  const textos = orden.map((k) => ({ clave: k, rotulo: PLANTILLA_LABEL[k], texto: config.plantillas[k], original: PLANTILLAS_DEFAULT[k] }));
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <EncabezadoAjuste
        titulo="Textos de WhatsApp"
        detalle={esDuenio ? "Tocá uno para cambiarlo. Se guarda solo cuando salís del texto." : "Los mensajes que les llegan a los alumnos. Sólo el dueño del negocio los cambia."}
        pendientes={numero}
      />
      {esDuenio ? (
        <EditorTextos textos={textos} datos={datosDeEjemplo({ alias: config.aliasCbu, profe: negocio.profe, origen: base })} />
      ) : (
        <ul className="grid gap-2" data-qa="textos-fijos">
          {textos.map((t) => (
            <li key={t.clave} className="rounded-2xl border border-line bg-surface-raised p-4">
              <p className="text-sm font-semibold text-strong">{t.rotulo}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-muted">{t.texto}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
