import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { requireCapability } from "@/lib/authz";
import { cn, Field, Input, Select, Textarea } from "@/components/ui";
import { roleHasCapability } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { configInmo, hoyDia, personas, propiedadesParaContrato } from "@/lib/inmobiliaria/datos.server";
import { crearContrato } from "@/lib/inmobiliaria/acciones";
import { COMISION_ADMIN_LEGAL, INDICE_LABEL, INDICES, sumarDias, sumarMesesADia } from "@/lib/inmobiliaria/core";
import { BarraInmo, RAIZ, subtitulo, tarjeta, titulo } from "../../_vista";
import { BotonEnviar, FormAccion } from "../../_piezas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inmobiliaria · Nuevo contrato" };

export default async function NuevoContrato() {
  const user = await requireApp("inmobiliaria");
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const [config, gente, fichas] = await Promise.all([configInmo(tenantId), personas(), propiedadesParaContrato()]);
  const inicio = `${sumarMesesADia(hoyDia(), 1).slice(0, 7)}-01`;
  const fin = sumarDias(sumarMesesADia(inicio, 24), -1);
  const opcionesDeGente = gente.map((c) => (
    <option key={c.id} value={c.id}>
      {c.nombre} · {c.telefono}
    </option>
  ));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <header className="mb-4">
        <Link href={`${RAIZ}/alquileres`} className="inline-flex min-h-11 items-center text-sm underline">
          ← Alquileres
        </Link>
        <h1 className={titulo}>Nuevo contrato</h1>
        <p className="text-sm text-muted">Al guardar se arman todas las cuotas y la propiedad sale del sitio.</p>
      </header>
      <BarraInmo activa={`${RAIZ}/alquileres`} conPlata esDuenio={roleHasCapability(user.role, "users:manage")} />

      <FormAccion accion={crearContrato} irA={`${RAIZ}/alquileres/{id}`} className="grid grid-cols-1 gap-4">
        <section className={cn(tarjeta, "grid grid-cols-1 gap-3")} aria-label="Propiedad">
          <h2 className={subtitulo}>Qué se alquila</h2>
          <Field label="Propiedad" htmlFor="propiedadId" required hint="Sólo aparecen las que no tienen un contrato vigente.">
            <Select id="propiedadId" name="propiedadId" required defaultValue="">
              <option value="" disabled>
                Elegí la propiedad
              </option>
              {fichas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
        </section>

        <section className={cn(tarjeta, "grid grid-cols-1 gap-3 sm:grid-cols-2")} aria-label="Las partes">
          <h2 className={cn(subtitulo, "sm:col-span-2")}>Quiénes</h2>
          <Field label="Inquilino" htmlFor="inquilinoId" className="sm:col-span-2" hint="Elegilo de la lista o cargalo abajo si es nuevo.">
            <Select id="inquilinoId" name="inquilinoId" defaultValue="">
              <option value="">Es nuevo (lo cargo abajo)</option>
              {opcionesDeGente}
            </Select>
          </Field>
          <Field label="Inquilino nuevo: nombre" htmlFor="inquilinoNombre">
            <Input id="inquilinoNombre" name="inquilinoNombre" maxLength={80} />
          </Field>
          <Field label="Inquilino nuevo: teléfono" htmlFor="inquilinoTelefono">
            <Input id="inquilinoTelefono" name="inquilinoTelefono" type="tel" inputMode="tel" />
          </Field>
          <Field label="Propietario" htmlFor="propietarioId" className="sm:col-span-2" hint="Si lo dejás así, se toma el que tiene cargado la propiedad.">
            <Select id="propietarioId" name="propietarioId" defaultValue="">
              <option value="">El de la ficha (o lo cargo abajo)</option>
              {opcionesDeGente}
            </Select>
          </Field>
          <Field label="Propietario nuevo: nombre" htmlFor="propietarioNombre">
            <Input id="propietarioNombre" name="propietarioNombre" maxLength={80} />
          </Field>
          <Field label="Propietario nuevo: teléfono" htmlFor="propietarioTelefono">
            <Input id="propietarioTelefono" name="propietarioTelefono" type="tel" inputMode="tel" />
          </Field>
        </section>

        <section className={cn(tarjeta, "grid grid-cols-1 gap-3 sm:grid-cols-2")} aria-label="Plazo y alquiler">
          <h2 className={cn(subtitulo, "sm:col-span-2")}>Plazo y alquiler</h2>
          <Field label="Empieza" htmlFor="inicio" required>
            <Input id="inicio" name="inicio" type="date" required defaultValue={inicio} />
          </Field>
          <Field label="Termina" htmlFor="fin" required>
            <Input id="fin" name="fin" type="date" required defaultValue={fin} />
          </Field>
          <Field label="Alquiler inicial ($ por mes)" htmlFor="montoInicial" required hint="En pesos. Los contratos en dólares todavía no se administran acá.">
            <Input id="montoInicial" name="montoInicial" importe inputMode="decimal" required />
          </Field>
          <Field label="Vence el día" htmlFor="diaVencimiento" hint="Del 1 al 28 de cada mes.">
            <Input id="diaVencimiento" name="diaVencimiento" inputMode="numeric" defaultValue="10" />
          </Field>
          <Field label="Depósito ($)" htmlFor="deposito">
            <Input id="deposito" name="deposito" importe inputMode="decimal" />
          </Field>
          <Field label="Garantía" htmlFor="garantia">
            <Input id="garantia" name="garantia" maxLength={500} placeholder="Garantes, seguro de caución…" />
          </Field>
        </section>

        <section className={cn(tarjeta, "grid grid-cols-1 gap-3 sm:grid-cols-3")} aria-label="Actualización">
          <h2 className={cn(subtitulo, "sm:col-span-3")}>Cómo se actualiza</h2>
          <Field label="Índice" htmlFor="ajusteIndice" required>
            <Select id="ajusteIndice" name="ajusteIndice" defaultValue="ICL" required>
              {INDICES.map((i) => (
                <option key={i} value={i}>
                  {INDICE_LABEL[i]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cada cuántos meses" htmlFor="ajusteCadaMeses">
            <Input id="ajusteCadaMeses" name="ajusteCadaMeses" inputMode="numeric" defaultValue="6" />
          </Field>
          <Field label="% de cada actualización" htmlFor="ajusteFijoPct" hint="Sólo con «Porcentaje fijo».">
            <Input id="ajusteFijoPct" name="ajusteFijoPct" inputMode="decimal" />
          </Field>
          <p className="text-sm text-muted sm:col-span-3">
            Las reglas quedan guardadas en este contrato: si después cambia la ley o la configuración, este contrato sigue como se firmó.
          </p>
        </section>

        <section className={cn(tarjeta, "grid grid-cols-1 gap-3 sm:grid-cols-2")} aria-label="Administración">
          <h2 className={cn(subtitulo, "sm:col-span-2")}>Administración</h2>
          <Field label="Comisión (% del alquiler cobrado)" htmlFor="comisionPct" hint={`En la provincia de Buenos Aires la escala va del ${COMISION_ADMIN_LEGAL.min} al ${COMISION_ADMIN_LEGAL.max} %, a cargo del propietario.`}>
            <Input id="comisionPct" name="comisionPct" inputMode="decimal" defaultValue={String(config.comisionAdminPct).replace(".", ",")} />
          </Field>
          <Field label="Interés por mora (% por día)" htmlFor="punitorioDiarioPct">
            <Input id="punitorioDiarioPct" name="punitorioDiarioPct" inputMode="decimal" defaultValue={String(config.punitorioDiarioPct).replace(".", ",")} />
          </Field>
          <Field label="Notas" htmlFor="notas" className="sm:col-span-2">
            <Textarea id="notas" name="notas" rows={3} maxLength={2000} />
          </Field>
        </section>

        <BotonEnviar pendingText="Armando las cuotas…" className="h-14 w-full justify-center text-lg sm:w-auto sm:justify-self-start">
          Guardar contrato
        </BotonEnviar>
      </FormAccion>
    </main>
  );
}
