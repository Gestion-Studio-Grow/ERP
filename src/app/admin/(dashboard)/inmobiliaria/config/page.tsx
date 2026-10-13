import { requireApp } from "@/lib/require-app";
import { requireCapability } from "@/lib/authz";
import { cn, Field, Input, Select, Textarea } from "@/components/ui";
import { getCurrentTenantId } from "@/lib/tenant";
import { configInmo, indicesCargados } from "@/lib/inmobiliaria/datos.server";
import { cargarIndice, guardarConfigInmo } from "@/lib/inmobiliaria/acciones";
import { CLAVES_PLANTILLA, COMISION_ADMIN_LEGAL, comisionFueraDeEscala, diaCorto, INDICE_LABEL, nombrePeriodo, PLANTILLA_LABEL, PLANTILLAS_DEFAULT, type IndiceAjuste } from "@/lib/inmobiliaria/core";
import { BarraInmo, RAIZ, subtitulo, tarjeta, titulo } from "../_vista";
import { BajarIndices, BotonEnviar, FormAccion } from "../_piezas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inmobiliaria · Configuración" };

const SERIES: IndiceAjuste[] = ["ICL", "IPC", "CASA_PROPIA"];
const coma = (v: number): string => String(v).replace(".", ",");

export default async function Configuracion() {
  await requireApp("inmobiliaria");
  // Comisiones, mora y datos de cobro: sólo el dueño.
  await requireCapability("users:manage");
  const tenantId = await getCurrentTenantId();
  const [c, indices] = await Promise.all([configInmo(tenantId), indicesCargados()]);
  const ultimos = SERIES.map((i) => ({ indice: i, puntos: indices.find((x) => x.indice === i)?.ultimos ?? [], total: indices.find((x) => x.indice === i)?.total ?? 0 }));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <header className="mb-4">
        <h1 className={titulo}>Configuración</h1>
        <p className="text-sm text-muted">Con qué valores nace un contrato nuevo, cómo se cobra y qué dicen los mensajes.</p>
      </header>

      <BarraInmo activa={`${RAIZ}/config`} conPlata esDuenio />

      <form action={guardarConfigInmo} className="grid grid-cols-1 gap-4">
        <section className={cn(tarjeta, "grid grid-cols-1 gap-3 sm:grid-cols-2")} aria-label="Administración de alquileres">
          <h2 className={cn(subtitulo, "sm:col-span-2")}>Administración de alquileres</h2>
          <Field
            label="Comisión por administrar (% del alquiler cobrado)"
            htmlFor="comisionAdminPct"
            hint={`Escala de la provincia de Buenos Aires: ${COMISION_ADMIN_LEGAL.min} a ${COMISION_ADMIN_LEGAL.max} %, a cargo del propietario.${comisionFueraDeEscala(c.comisionAdminPct) ? " ⚠️ El valor cargado queda fuera de esa escala." : ""}`}
          >
            <Input id="comisionAdminPct" name="comisionAdminPct" inputMode="decimal" defaultValue={coma(c.comisionAdminPct)} />
          </Field>
          <Field label="IVA sobre la comisión (%)" htmlFor="ivaComisionPct" hint="0 si la inmobiliaria es monotributista; 21 si es responsable inscripta.">
            <Input id="ivaComisionPct" name="ivaComisionPct" inputMode="decimal" defaultValue={coma(c.ivaComisionPct)} />
          </Field>
          <Field label="Interés por mora (% por día)" htmlFor="punitorioDiarioPct" hint="Con lo que nace un contrato nuevo. Cada contrato guarda el suyo.">
            <Input id="punitorioDiarioPct" name="punitorioDiarioPct" inputMode="decimal" defaultValue={coma(c.punitorioDiarioPct)} />
          </Field>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm font-medium text-strong">
            <input type="checkbox" name="punitoriosAlPropietario" defaultChecked={c.punitoriosAlPropietario} className="size-5" /> La mora cobrada va al propietario
          </label>
        </section>

        <section className={cn(tarjeta, "grid grid-cols-1 gap-3 sm:grid-cols-2")} aria-label="Cobro y datos de la casa">
          <h2 className={cn(subtitulo, "sm:col-span-2")}>Cobro y datos de la casa</h2>
          <Field label="Alias para transferencias" htmlFor="aliasCbu" hint="Lo ve el inquilino en su link.">
            <Input id="aliasCbu" name="aliasCbu" defaultValue={c.aliasCbu} maxLength={60} />
          </Field>
          <Field label="Link de pago de Mercado Pago" htmlFor="linkMercadoPago">
            <Input id="linkMercadoPago" name="linkMercadoPago" type="url" defaultValue={c.linkMercadoPago} placeholder="https://…" />
          </Field>
          <Field label="Matrícula" htmlFor="matricula" hint="Sale al pie del sitio.">
            <Input id="matricula" name="matricula" defaultValue={c.matricula} maxLength={80} placeholder="Martillero y corredor público · Mat. …" />
          </Field>
          <Field label="Prefijo de los códigos" htmlFor="prefijoCodigo" hint="Las fichas nuevas salen PRE-0001, PRE-0002…">
            <Input id="prefijoCodigo" name="prefijoCodigo" defaultValue={c.prefijoCodigo} maxLength={6} />
          </Field>
        </section>

        <section className={cn(tarjeta, "grid grid-cols-1 gap-3")} aria-label="Mensajes de WhatsApp">
          <h2 className={subtitulo}>Mensajes de WhatsApp</h2>
          <p className="text-sm text-muted">Lo que va entre llaves se completa solo. Si dejás uno igual al original, se usa el original.</p>
          {CLAVES_PLANTILLA.map((k) => (
            <Field key={k} label={PLANTILLA_LABEL[k]} htmlFor={`plantilla_${k}`}>
              <Textarea id={`plantilla_${k}`} name={`plantilla_${k}`} rows={3} maxLength={900} defaultValue={c.plantillas[k] === PLANTILLAS_DEFAULT[k] ? "" : c.plantillas[k]} placeholder={PLANTILLAS_DEFAULT[k]} />
            </Field>
          ))}
        </section>

        <BotonEnviar pendingText="Guardando…" className="h-14 w-full justify-center text-lg sm:w-auto sm:justify-self-start">
          Guardar configuración
        </BotonEnviar>
      </form>

      <section id="indices" className={cn(tarjeta, "mt-6 grid scroll-mt-20 grid-cols-1 gap-3")} aria-label="Índices de actualización">
        <h2 className={subtitulo}>Índices para actualizar alquileres</h2>
        <p className="text-sm text-muted">
          El ICL se baja del Banco Central (día por día) y el IPC del INDEC por datos.gob.ar (mes por mes). «Casa Propia» no tiene servicio público: se carga a mano.
        </p>
        <BajarIndices />
        <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          {ultimos.map((u) => (
            <li key={u.indice} className="rounded-xl border border-line p-3">
              <strong className="text-strong">{INDICE_LABEL[u.indice]}</strong>
              <span className="block text-xs text-muted">{u.total === 0 ? "Sin valores cargados" : `${u.total} valores · últimos:`}</span>
              {u.puntos.map((p) => (
                <span key={p.id} className="flex justify-between tabular-nums">
                  <span className={u.indice === "IPC" ? "inline-block first-letter:uppercase" : undefined}>{u.indice === "IPC" ? nombrePeriodo(p.fecha.slice(0, 7)) : diaCorto(p.fecha)}</span>
                  <span>{p.valor.toLocaleString("es-AR", { maximumFractionDigits: 4 })}</span>
                </span>
              ))}
            </li>
          ))}
        </ul>
        <FormAccion accion={cargarIndice} vaciar mensajeOk="Valor cargado." className="grid grid-cols-2 gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <Field label="Índice" htmlFor="i-indice">
            <Select id="i-indice" name="indice" defaultValue="ICL">
              {SERIES.map((i) => (
                <option key={i} value={i}>
                  {INDICE_LABEL[i]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha del valor" htmlFor="i-fecha" hint="IPC: cualquier día del mes.">
            <Input id="i-fecha" name="fecha" type="date" required />
          </Field>
          <Field label="Valor" htmlFor="i-valor">
            <Input id="i-valor" name="valor" inputMode="decimal" required placeholder="36,81" />
          </Field>
          <BotonEnviar variant="outline" size="md" pendingText="…" className="col-span-2 justify-center sm:col-span-1">
            Cargar a mano
          </BotonEnviar>
        </FormAccion>
      </section>
    </main>
  );
}
