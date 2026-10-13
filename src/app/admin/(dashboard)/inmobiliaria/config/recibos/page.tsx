import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { requireCapability } from "@/lib/authz";
import { cn, Field, Input, Textarea } from "@/components/ui";
import { getCurrentTenantId } from "@/lib/tenant";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { configInmo, reciboDeMuestra } from "@/lib/inmobiliaria/datos.server";
import { origenDelSitio } from "@/lib/inmobiliaria/sitio.server";
import { marcaInmo } from "@/lib/inmobiliaria/marca";
import { guardarConfigRecibo } from "@/lib/inmobiliaria/acciones";
import { Recibo } from "@/components/inmobiliaria/Recibo";
import { BarraInmo, RAIZ, subtitulo, tarjeta, titulo } from "../../_vista";
import { BotonEnviar, FormAccion } from "../../_piezas";

// Configurador de recibos: la inmobiliaria decide cómo se ve el recibo de alquiler y lo ve
// al lado, con el último cobro real (o uno de ejemplo si todavía no hubo cobros).
export const dynamic = "force-dynamic";
export const metadata = { title: "Inmobiliaria · Recibos" };

const tilde = "flex min-h-11 items-center gap-2 text-sm font-medium text-strong";

export default async function ConfiguradorDeRecibos() {
  await requireApp("inmobiliaria");
  await requireCapability("users:manage");
  const [tenantId, slug, origen] = await Promise.all([getCurrentTenantId(), getCurrentTenantSlug(), origenDelSitio()]);
  const [config, muestra] = await Promise.all([configInmo(tenantId), reciboDeMuestra(origen)]);
  const c = config.recibo;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5">
      <header className="mb-4">
        <Link href={`${RAIZ}/config`} className="inline-flex min-h-11 items-center text-sm underline">
          ← Configuración
        </Link>
        <h1 className={titulo}>Recibos de alquiler</h1>
        <p className="text-sm text-muted">Cada cobro genera un recibo numerado. Acá decidís cómo se ve; a la derecha lo ves con el último cobro.</p>
      </header>

      <BarraInmo activa={`${RAIZ}/config`} conPlata esDuenio />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
        <FormAccion accion={guardarConfigRecibo} mensajeOk="Guardado. La vista previa ya muestra el cambio." className="grid grid-cols-1 gap-4">
          <section className={cn(tarjeta, "grid grid-cols-1 gap-3 sm:grid-cols-2")} aria-label="Encabezado">
            <h2 className={cn(subtitulo, "sm:col-span-2")}>Encabezado</h2>
            <Field label="Título" htmlFor="titulo">
              <Input id="titulo" name="titulo" defaultValue={c.titulo} maxLength={80} />
            </Field>
            <Field label="Prefijo del número" htmlFor="prefijo" hint="Los recibos salen PREFIJO-00001, 00002…">
              <Input id="prefijo" name="prefijo" defaultValue={c.prefijo} maxLength={6} />
            </Field>
            <Field label="Quién emite" htmlFor="emisor" hint="Razón social o nombre del corredor. Vacío: el nombre del negocio.">
              <Input id="emisor" name="emisor" defaultValue={c.emisor} maxLength={120} />
            </Field>
            <Field label="CUIT (opcional)" htmlFor="cuit">
              <Input id="cuit" name="cuit" defaultValue={c.cuit} maxLength={20} inputMode="numeric" placeholder="20-12345678-9" />
            </Field>
            <label className={cn(tilde, "sm:col-span-2")}>
              <input type="checkbox" name="contacto" defaultChecked={c.contacto} className="size-5" /> Mostrar dirección, WhatsApp y mail del negocio
            </label>
          </section>

          <section className={cn(tarjeta, "grid grid-cols-1 gap-2")} aria-label="Qué muestra">
            <h2 className={subtitulo}>Qué muestra</h2>
            <label className={tilde}>
              <input type="checkbox" name="enLetras" defaultChecked={c.enLetras} className="size-5" /> El importe también en letras («son pesos…»)
            </label>
            <label className={tilde}>
              <input type="checkbox" name="detalle" defaultChecked={c.detalle} className="size-5" /> El detalle del período: alquiler, expensas y otros, mora
            </label>
            <label className={tilde}>
              <input type="checkbox" name="saldo" defaultChecked={c.saldo} className="size-5" /> El saldo que queda después del pago, si queda
            </label>
          </section>

          <section className={cn(tarjeta, "grid grid-cols-1 gap-3")} aria-label="Pie y firma">
            <h2 className={subtitulo}>Pie y firma</h2>
            <Field label="Debajo de la firma" htmlFor="firma">
              <Input id="firma" name="firma" defaultValue={c.firma} maxLength={80} />
            </Field>
            <Field label="Línea de cierre" htmlFor="gracias" hint="Vacío para no mostrarla.">
              <Input id="gracias" name="gracias" defaultValue={c.gracias} maxLength={120} />
            </Field>
            <Field label="Pie legal" htmlFor="pie" hint="En letra chica, al final. Lo que diga tu contador.">
              <Textarea id="pie" name="pie" defaultValue={c.pie} rows={3} maxLength={400} />
            </Field>
          </section>

          <BotonEnviar pendingText="Guardando…" className="h-14 w-full justify-center text-lg sm:w-auto sm:justify-self-start">
            Guardar y ver
          </BotonEnviar>
        </FormAccion>

        <section aria-label="Vista previa" className="lg:sticky lg:top-20">
          <p className="mb-2 text-sm text-muted">Vista previa con {muestra.cobradoPor ? "el último cobro" : "un cobro de ejemplo"} · así lo ve el inquilino y así se imprime.</p>
          <Recibo d={muestra} marca={marcaInmo(slug)} vistaPrevia />
        </section>
      </div>
    </main>
  );
}
