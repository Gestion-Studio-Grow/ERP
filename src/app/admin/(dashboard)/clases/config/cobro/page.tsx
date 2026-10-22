import { requireApp } from "@/lib/require-app";
import { cn } from "@/components/ui";
import { badgePendientes, configCompleta } from "@/lib/padel/datos.server";
import { tarjeta } from "../../_vista";
import { EncabezadoAjuste } from "../_encabezado";
import { CampoAuto } from "../_campo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Cobro", manifest: "/clases/app.webmanifest" };

// Ajustes → Cobro (E2): el alias y el titular que ve el alumno para transferirte, y tu celular
// (el botón «Escribirle» del turnero y del link del alumno). Se guarda solo, campo por campo.
// Mercado Pago llega más adelante (Tanda 6, post-venta): no se muestra hasta que exista.
export default async function AjustesCobro() {
  await requireApp("padel-clases");
  const [{ config }, numero] = await Promise.all([configCompleta(), badgePendientes()]);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <EncabezadoAjuste titulo="Cobro" detalle="Lo que ve el alumno para pagarte. Se guarda solo." pendientes={numero} />
      <section className={cn(tarjeta, "grid gap-4")} aria-label="Datos para cobrar">
        <CampoAuto clave="aliasCbu" etiqueta="Alias o CBU" inicial={config.aliasCbu} placeholder="matias.padel" maxLength={60} ayuda="Lo copian con un toque desde su link." qa="alias" />
        <CampoAuto clave="titularCuenta" etiqueta="Titular de la cuenta" inicial={config.titularCuenta} placeholder="Como figura en el banco" maxLength={80} ayuda="Para que el alumno vea que transfiere a la persona correcta." qa="titular" />
        <CampoAuto
          clave="whatsappProfe"
          etiqueta="Tu celular (WhatsApp)"
          inicial={config.whatsappProfe}
          formato="celular"
          tipo="tel"
          inputMode="tel"
          placeholder="11 5555-1234"
          ayuda="Con código de área. Es el botón «Escribirle» que ven tus alumnos."
          qa="whatsapp-profe"
        />
      </section>
    </main>
  );
}
