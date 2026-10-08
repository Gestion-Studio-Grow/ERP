import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { Input, Select, Textarea } from "@/components/ui";
import { configTaller } from "@/lib/taller/datos.server";
import { guardarConfig } from "@/lib/taller/acciones";
import { CLAVES_PLANTILLA, PLANTILLA_LABEL } from "@/lib/taller/core";
import { BarraTaller, tarjeta } from "../_vista";
import { BotonEnviar } from "../_piezas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Taller · Configuración" };

const etiqueta = "mb-1 block text-sm font-semibold text-strong";
const coma = (n: number) => String(n).replace(".", ",");

export default async function ConfigTallerPage() {
  await requireApp("taller");
  await requireCapability("users:manage");
  const c = await configTaller(await getCurrentTenantId());

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <h1 className="mb-4 text-2xl font-bold text-strong">Configuración del taller</h1>
      <BarraTaller activa="/admin/taller/config" conPlata />

      <form action={guardarConfig} className="grid grid-cols-1 gap-4">
        <section className={tarjeta}>
          <h2 className="mb-3 text-lg font-bold text-strong">Presupuestos y precios</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="margenPct" className={etiqueta}>Margen sobre repuestos (%)</label><Input id="margenPct" name="margenPct" inputMode="decimal" defaultValue={coma(c.margenPct)} className="h-12" /></div>
            <div><label htmlFor="validezDias" className={etiqueta}>Validez del presupuesto (días)</label><Input id="validezDias" name="validezDias" inputMode="numeric" defaultValue={c.validezDias} className="h-12" /></div>
            <div><label htmlFor="garantiaDias" className={etiqueta}>Garantía por trabajo (días)</label><Input id="garantiaDias" name="garantiaDias" inputMode="numeric" defaultValue={c.garantiaDias} className="h-12" /></div>
            <div><label htmlFor="valorHora" className={etiqueta}>Valor de la hora de taller</label><Input id="valorHora" name="valorHora" inputMode="decimal" defaultValue={c.valorHora ? coma(c.valorHora) : ""} placeholder="0" className="h-12" /></div>
          </div>
          <p className="mt-3 text-sm text-muted">
            ¿Subieron los precios? Actualizá toda la lista de una por porcentaje en{" "}
            <Link href="/admin/catalogo" className="underline">Catálogo y precios</Link>.
          </p>
        </section>

        <section className={tarjeta}>
          <h2 className="mb-3 text-lg font-bold text-strong">Cobros</h2>
          <div className="grid grid-cols-1 gap-3">
            <div><label htmlFor="aliasCbu" className={etiqueta}>Alias o CBU para transferencias</label><Input id="aliasCbu" name="aliasCbu" defaultValue={c.aliasCbu} placeholder="taller.agr.mp" className="h-12" /></div>
            <div><label htmlFor="linkMercadoPago" className={etiqueta}>Link de pago de Mercado Pago <span className="font-normal text-muted">(opcional)</span></label><Input id="linkMercadoPago" name="linkMercadoPago" type="url" defaultValue={c.linkMercadoPago} placeholder="https://mpago.la/…" className="h-12" /></div>
          </div>
          <h3 className="mb-2 mt-4 text-sm font-bold text-strong">Recargo por tarjeta (%)</h3>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {([["r_debito", "Débito", c.recargos.debito], ["r_cuotas1", "Crédito 1 pago", c.recargos.cuotas1], ["r_cuotas3", "3 cuotas", c.recargos.cuotas3], ["r_cuotas6", "6 cuotas", c.recargos.cuotas6], ["r_cuotas12", "12 cuotas", c.recargos.cuotas12]] as const).map(([name, label, v]) => (
              <div key={name}><label htmlFor={name} className={etiqueta}>{label}</label><Input id={name} name={name} inputMode="decimal" defaultValue={coma(v)} className="h-12" /></div>
            ))}
          </div>
        </section>

        <section className={tarjeta}>
          <h2 className="mb-3 text-lg font-bold text-strong">Facturación</h2>
          <label htmlFor="condicionIva" className={etiqueta}>Condición frente al IVA del taller</label>
          <Select id="condicionIva" name="condicionIva" defaultValue={c.condicionIva} className="h-12">
            <option value="MONOTRIBUTO">Monotributo (factura C)</option>
            <option value="RESPONSABLE_INSCRIPTO">Responsable inscripto (factura A o B)</option>
          </Select>
          <p className="mt-2 text-sm text-muted">
            Por ahora el taller entrega un comprobante interno, no válido como factura. La factura electrónica se emite desde{" "}
            <Link href="/admin/facturacion" className="underline">Facturación</Link>.
          </p>
        </section>

        <section className={tarjeta}>
          <h2 className="mb-3 text-lg font-bold text-strong">Reseñas</h2>
          <label htmlFor="linkResena" className={etiqueta}>Link para dejar una reseña en Google</label>
          <Input id="linkResena" name="linkResena" type="url" defaultValue={c.linkResena} placeholder="https://g.page/r/…/review" className="h-12" />
          <p className="mt-2 text-sm text-muted">Se lo mandamos al cliente al entregarle el auto.</p>
        </section>

        <section className={tarjeta}>
          <h2 className="mb-1 text-lg font-bold text-strong">Mensajes de WhatsApp</h2>
          <p className="mb-3 text-sm text-muted">
            Escribilos a tu manera. Lo que va entre llaves se completa solo: {"{nombre} {vehiculo} {patente} {taller} {link} {total} {saldo} {validez} {garantia} {resena} {fecha} {hora} {alias} {turnos} {direccion} {horario}"}.
          </p>
          <div className="grid grid-cols-1 gap-3">
            {CLAVES_PLANTILLA.map((k) => (
              <div key={k}>
                <label htmlFor={`plantilla_${k}`} className={etiqueta}>{PLANTILLA_LABEL[k]}</label>
                <Textarea id={`plantilla_${k}`} name={`plantilla_${k}`} rows={3} defaultValue={c.plantillas[k]} />
              </div>
            ))}
          </div>
        </section>

        <div className="sticky bottom-0 -mx-4 border-t border-line bg-surface px-4 py-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <BotonEnviar pendingText="Guardando…" variant="solid" size="lg" className="h-14 w-full justify-center text-base">Guardar configuración</BotonEnviar>
        </div>
      </form>
    </main>
  );
}
