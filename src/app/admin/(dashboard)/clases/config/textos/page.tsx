import { requireApp } from "@/lib/require-app";
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
export default async function AjustesTextos() {
  await requireApp("padel-clases");
  const [{ config, negocio }, numero, base] = await Promise.all([configCompleta(), badgePendientes(), origen()]);
  const orden = [...CLAVES_PLANTILLA.filter((k) => k !== "pedidoAlProfe"), "pedidoAlProfe" as const];
  const textos = orden.map((k) => ({ clave: k, rotulo: PLANTILLA_LABEL[k], texto: config.plantillas[k], original: PLANTILLAS_DEFAULT[k] }));
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <EncabezadoAjuste titulo="Textos de WhatsApp" detalle="Tocá uno para cambiarlo. Se guarda solo cuando salís del texto." pendientes={numero} />
      <EditorTextos textos={textos} datos={datosDeEjemplo({ alias: config.aliasCbu, profe: negocio.profe, origen: base })} />
    </main>
  );
}
