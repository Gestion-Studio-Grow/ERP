import Link from "next/link";
import { redirect } from "next/navigation";
import { cn } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { actorActual } from "@/lib/proyectos/gestion.server";
import { fechaCorta } from "@/lib/proyectos/core";
import { guardarParametro, volverAlValorDelRubro } from "@/lib/proyectos/acciones-parametros";
import { CATALOGO, ESTADOS_INTERNOS, GRUPOS, delGrupo, esGrupo, type DefParametro, type Valores, type EtapaParam, type ConId, type ConRango } from "@/lib/proyectos/parametros/catalogo";
import { participantes, textoDelValor, valoresDe, type Parametros } from "@/lib/proyectos/parametros/validar";
import { historialDeParametros, parametrosDelNegocio } from "@/lib/proyectos/parametros/leer.server";
import { campo, etiqueta, tarjeta } from "../../_vista";
import { FormParametro, VolverAlRubro } from "./_formulario";
import { CampoCodigo } from "@/components/segundo-paso/CampoCodigo";
import { parametroPideCodigo, rigeSegundoPaso } from "@/lib/proyectos/segundo-factor-core";
import { rubroDe } from "@/lib/proyectos/segundo-factor.server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Parámetros del módulo" };

const NOMBRE_ESTADO: Record<string, string> = { PEDIDO: "Lead / brief", DISENO: "Desglose", RENDER: "Propuesta creativa", PRESUPUESTO: "Cotización", PROPUESTA: "Enviado al cliente", APROBADO: "Confirmado", PRODUCCION: "Desarrollo técnico", ARMADO: "Producción y seguimiento", DESARME: "Evento", CIERRE: "Cierre" };
const chip = "flex min-h-11 items-center rounded-lg border border-line px-3 text-sm";
const marca = "rounded border border-line px-1.5 py-0.5 text-xs font-medium";

const num = (n: number) => String(n).replace(".", ",");

/** Los campos de un parámetro, según su tipo. Los nombres los lee `valorDelFormulario`. */
function Campos({ def, valor, vigentes }: { def: DefParametro; valor: unknown; vigentes: Valores }) {
  const t = def.def;
  const rango = (prefijo: string, r: ConRango, titulo?: string) => (
    <fieldset className="grid gap-2">
      {titulo && <legend className="mb-1 text-sm font-medium text-strong">{titulo}</legend>}
      <div className="grid grid-cols-3 gap-2">
        <label className={etiqueta}>Valor %<input name={`valor${prefijo}`} inputMode="decimal" defaultValue={num(r.valor)} className={campo} /></label>
        <label className={etiqueta}>Mínimo<input name={`min${prefijo}`} inputMode="decimal" defaultValue={num(r.min)} className={campo} /></label>
        <label className={etiqueta}>Máximo<input name={`max${prefijo}`} inputMode="decimal" defaultValue={num(r.max)} className={campo} /></label>
      </div>
    </fieldset>
  );
  switch (t.tipo) {
    case "porcentaje":
      return <label className={etiqueta}>{def.nombre}<input name="valor" inputMode="decimal" defaultValue={num(valor as number)} className={cn(campo, "max-w-40")} /></label>;
    case "entero":
      return <label className={etiqueta}>{def.nombre} <span className="font-normal text-muted">({t.unidad})</span><input name="valor" inputMode="numeric" defaultValue={String(valor)} className={cn(campo, "max-w-40")} /></label>;
    case "conRango":
      return rango("", valor as ConRango);
    case "opcion":
      return (
        <label className={etiqueta}>{def.nombre}
          <select name="valor" defaultValue={valor as string} className={campo}>{t.opciones.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        </label>
      );
    case "booleano":
      return (
        <label className={etiqueta}>{def.nombre}
          <select name="valor" defaultValue={valor ? "1" : "0"} className={cn(campo, "max-w-40")}><option value="1">{t.si}</option><option value="0">{t.no}</option></select>
        </label>
      );
    case "lista":
      return <label className={etiqueta}>{def.nombre} <span className="font-normal text-muted">(uno por renglón)</span><textarea name="valor" rows={Math.min(10, (valor as string[]).length + 2)} defaultValue={(valor as string[]).join("\n")} className="w-full rounded-lg border border-line bg-surface p-3 text-sm text-strong" /></label>;
    case "multiple":
      return (
        <fieldset className="grid gap-1"><legend className="mb-1 text-sm font-medium text-strong">{def.nombre}</legend>
          {t.opciones.map((o) => <label key={o.id} className="flex min-h-11 items-center gap-2 text-sm text-strong"><input type="checkbox" name="valor" value={o.id} defaultChecked={(valor as string[]).includes(o.id)} className="h-5 w-5" />{o.label}</label>)}
        </fieldset>
      );
    case "conId": {
      const items = valor as ConId[];
      return (
        <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-medium text-strong">{def.nombre}</legend>
          <input type="hidden" name="n" value={items.length} />
          {items.map((x, i) => (
            <div key={x.id} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name={`id_${i}`} value={x.id} />
              <input name={`nombre_${i}`} defaultValue={x.nombre} aria-label={`Nombre de ${x.nombre}`} className={cn(campo, "max-w-xs flex-1")} />
              <label className="flex min-h-11 items-center gap-2 text-sm text-muted"><input type="checkbox" name={`quitar_${i}`} className="h-5 w-5" />Quitar</label>
            </div>
          ))}
          <label className={etiqueta}>Sumar otra<input name="nuevo" placeholder="Nombre" className={cn(campo, "max-w-xs")} /></label>
        </fieldset>
      );
    }
    case "etapas": {
      const etapas = valor as EtapaParam[];
      const casilleros = Math.min(ESTADOS_INTERNOS.length, etapas.length + 2);
      const deEstado = (e: string) => etapas.findIndex((x) => x.estados.includes(e as never));
      return (
        <div className="grid gap-4">
          <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-medium text-strong">Etapas, en orden</legend>
            {[...Array(casilleros).keys()].map((k) => (
              <div key={k} className="grid gap-2 sm:grid-cols-[2rem_1fr_10rem] sm:items-center">
                <span className="text-sm text-muted">{k + 1}.</span>
                <input type="hidden" name={`id_${k}`} value={etapas[k]?.id ?? ""} />
                <input name={`nombre_${k}`} defaultValue={etapas[k]?.nombre ?? ""} placeholder="Sin usar" aria-label={`Nombre de la etapa ${k + 1}`} className={campo} />
                <select name={`compuerta_${k}`} defaultValue={etapas[k]?.compuerta ?? "AVISA"} aria-label={`Compuerta de la etapa ${k + 1}`} className={campo}><option value="AVISA">Avisa al pasar</option><option value="FRENA">Frena al pasar</option></select>
              </div>
            ))}
          </fieldset>
          <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-medium text-strong">En qué etapa va cada estado</legend>
            <p className="text-sm text-muted">Los estados son fijos: la plata depende de ellos. Cada uno va en una etapa, y las etapas siguen su orden.</p>
            {ESTADOS_INTERNOS.map((e) => (
              <label key={e} className="grid gap-1 text-sm text-strong sm:grid-cols-[14rem_1fr] sm:items-center">{NOMBRE_ESTADO[e]}
                <select name={`estado_${e}`} defaultValue={String(Math.max(0, deEstado(e)))} className={campo}>
                  {[...Array(casilleros).keys()].map((k) => <option key={k} value={k}>Etapa {k + 1}{etapas[k] ? `: ${etapas[k].nombre}` : ""}</option>)}
                </select>
              </label>
            ))}
          </fieldset>
        </div>
      );
    }
    case "mapaConRango":
      return <div className="grid gap-3">{vigentes[t.clavesDe].map((f) => <div key={f.id}>{rango(`_${f.id}`, (valor as Record<string, ConRango>)[f.id] ?? { valor: 0, min: 0, max: 100 }, f.nombre)}</div>)}</div>;
    case "matriz": {
      const cols = participantes(vigentes[t.columnasDe]);
      const nombre = (c: string) => (c === "EMPRESA" ? "La empresa" : (vigentes[t.columnasDe].find((f) => f.id === c)?.nombre ?? c));
      const m = valor as Record<string, Record<string, number>>;
      return (
        <div className="grid gap-3">
          {vigentes[t.filasDe].map((fila) => (
            <fieldset key={fila.id} className="grid gap-2"><legend className="mb-1 text-sm font-medium text-strong">{fila.nombre} <span className="font-normal text-muted">(suma 100)</span></legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {cols.map((c) => <label key={c} className={etiqueta}>{nombre(c)} %<input name={`m_${fila.id}_${c}`} inputMode="decimal" defaultValue={num(m[fila.id]?.[c] ?? 0)} className={campo} /></label>)}
              </div>
            </fieldset>
          ))}
        </div>
      );
    }
    case "mapaTexto":
      return <div className="grid gap-2 sm:grid-cols-2">{t.claves.map((k) => <label key={k.id} className={etiqueta}>{k.label}<input name={`valor_${k.id}`} defaultValue={(valor as Record<string, string>)[k.id]} maxLength={40} className={campo} /></label>)}</div>;
    case "mapaOpcion":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {t.claves.map((k) => (
            <label key={k.id} className={etiqueta}>{k.label}
              <select name={`valor_${k.id}`} defaultValue={(valor as Record<string, string>)[k.id]} className={campo}>{t.opciones.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
            </label>
          ))}
        </div>
      );
    case "tramos":
      return <label className={etiqueta}>{def.nombre} <span className="font-normal text-muted">(separados por coma)</span><input name="valor" defaultValue={(valor as number[]).join(", ")} className={cn(campo, "max-w-xs")} /></label>;
  }
}

function Parametro({ def, p, vigentes, edita, dosPasos }: { def: DefParametro; p: Parametros; vigentes: Valores; edita: boolean; dosPasos: boolean }) {
  const r = p[def.clave];
  // MIA-50 T11 (O47): precio y reparto piden el código de la app en el momento, donde rigen los dos pasos.
  const codigo = dosPasos && parametroPideCodigo(def.grupo) ? <CampoCodigo accion="parametros" id={`codigo-${def.clave}`} /> : null;
  return (
    <section className={tarjeta} aria-label={def.nombre} data-clave={def.clave}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-strong">{def.nombre}</h2>
        {r.provisional && <span className={cn(marca, "text-danger")}>Provisional</span>}
        <span className={cn(marca, "text-muted")}>{r.origen === "RUBRO" ? "Valor del rubro" : "Del negocio"}</span>
      </div>
      <p className="text-sm text-strong">{textoDelValor(def, r.valor, vigentes)}</p>
      <p className="mt-1 text-xs text-muted">
        Dónde se nota: {def.seNota}. De dónde sale el valor del rubro: {def.fuente}.
        {r.origen === "NEGOCIO" && r.actualizadoEl ? ` Lo cambió ${r.actualizadoNombre} el ${fechaCorta(r.actualizadoEl)}.` : ""}
      </p>
      {edita && (
        <details className="mt-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-strong underline">Cambiar</summary>
          <div className="mt-2 grid gap-3">
            <FormParametro accion={guardarParametro} clave={def.clave} provisional={r.provisional}>
              <Campos def={def} valor={r.valor} vigentes={vigentes} />
              {codigo}
            </FormParametro>
            {r.origen === "NEGOCIO" && <VolverAlRubro accion={volverAlValorDelRubro} clave={def.clave} codigo={codigo && <CampoCodigo accion="parametros" id={`codigo-rubro-${def.clave}`} />} />}
          </div>
        </details>
      )}
    </section>
  );
}

export default async function ParametrosDelModulo({ searchParams }: { searchParams: Promise<{ grupo?: string }> }) {
  await requireApp("proyectos");
  const a = await actorActual();
  // Edita Dirección; Administración ve; el resto no entra (plan MIA-50, O45).
  if (a.rol !== "DIRECCION" && a.rol !== "ADMINISTRACION") redirect("/admin/proyectos/inicio");
  const edita = a.rol === "DIRECCION";
  const dosPasos = edita && rigeSegundoPaso(await rubroDe(a.tenantId));
  const { grupo: pedido } = await searchParams;
  const grupo = pedido === "provisionales" ? "provisionales" : esGrupo(pedido) ? pedido : "etapas";
  const p = await parametrosDelNegocio(a.tenantId);
  const vigentes = valoresDe(p);
  const provisionales = CATALOGO.filter((d) => p[d.clave].provisional);
  const defs = grupo === "provisionales" ? [] : delGrupo(grupo);
  const historial = grupo === "provisionales" ? [] : await historialDeParametros(a.tenantId, defs.map((d) => d.clave), 20, vigentes);

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-5">
      <div>
        <h1 className="text-2xl font-bold text-strong">Parámetros del módulo</h1>
        <p className="mt-1 text-sm text-muted">{edita ? "Lo que cambies acá rige para los proyectos que todavía no aprobó el cliente, y queda en el historial." : "Los ves para consultar: los cambia Dirección."} Sin un valor del negocio rige el del rubro.</p>
      </div>
      <nav aria-label="Grupos de parámetros" className="flex flex-wrap gap-1">
        {GRUPOS.map((g) => <Link key={g.id} href={`?grupo=${g.id}`} aria-current={g.id === grupo ? "page" : undefined} className={cn(chip, g.id === grupo ? "bg-accent text-on-accent" : "text-strong")}>{g.label}</Link>)}
        <Link href="?grupo=provisionales" aria-current={grupo === "provisionales" ? "page" : undefined} className={cn(chip, grupo === "provisionales" ? "bg-accent text-on-accent" : "text-strong")}>Provisionales ({provisionales.length})</Link>
      </nav>

      {grupo === "provisionales" ? (
        <section className={tarjeta} aria-label="Provisionales">
          <h2 className="mb-1 font-semibold text-strong">Valores a confirmar</h2>
          <p className="mb-3 text-sm text-muted">Están en uso, pero falta que el negocio los confirme.</p>
          <ul className="grid gap-2">
            {provisionales.map((d) => (
              <li key={d.clave} data-clave={d.clave} className="border-t border-line pt-2 text-sm">
                <Link href={`?grupo=${d.grupo}`} className="inline-flex min-h-11 items-center font-medium text-strong underline">{d.nombre}</Link>
                <span className="block text-muted">{textoDelValor(d, p[d.clave].valor, vigentes)} · {GRUPOS.find((g) => g.id === d.grupo)?.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          {defs.map((d) => <Parametro key={d.clave} def={d} p={p} vigentes={vigentes} edita={edita} dosPasos={dosPasos} />)}
          <section className={tarjeta} aria-label="Historial">
            <h2 className="mb-2 font-semibold text-strong">Historial de {GRUPOS.find((g) => g.id === grupo)?.label.toLowerCase()}</h2>
            {historial.length === 0 ? (
              <p className="text-sm text-muted">Todavía no hubo cambios.</p>
            ) : (
              <ul className="grid gap-2">
                {historial.map((h) => (
                  <li key={h.id} className="border-t border-line pt-2 text-sm">
                    <span className="font-medium text-strong">{h.nombre}</span>
                    <span className="block text-strong">{h.antes}{h.provisionalAntes ? " (provisional)" : ""} → {h.despues}{h.provisionalDespues ? " (provisional)" : ""}</span>
                    <span className="block text-xs text-muted">{h.autorNombre} · {fechaCorta(h.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      <p className="text-sm text-muted">
        Las vistas de las listas se guardan desde cada lista (Administración, cuentas a cobrar y a pagar). Los permisos por rol, en{" "}
        <Link href="/admin/proyectos/equipo?tab=permisos" className="inline-flex min-h-11 items-center underline">Equipo › Permisos</Link>.
      </p>
    </main>
  );
}
