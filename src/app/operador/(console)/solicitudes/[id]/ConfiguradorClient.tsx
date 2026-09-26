"use client";

// CONFIGURADOR (Soporte GSG) — la pantalla. Pasos numerados en una sola hoja: 1 Estudio · 2 Cliente ·
// 3 Plan y rubro · 4 Accesos · 5 Revisar y crear · 6 Pasale esto. Campos CONTROLADOS: un error no
// borra lo escrito. El botón se deshabilita con el primer clic y el servidor igual es idempotente
// (candado por pedido): un doble clic crea un solo negocio. Sin Prisma: sólo reglas puras y la action.

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { Bloque, Franja } from "@/components/ui/Renglon";
import { PLANES, RUBROS, type PlanId } from "@/planes/catalogo";
import { waLinkClienta, buildWhatsAppHref } from "@/lib/whatsapp-cta";
import {
  CONDICIONES_IVA,
  NOMBRE_CONDICION_IVA,
  NOMBRE_TAMANIO,
  TAMANIOS,
  esTamanio,
  planesPosibles,
  type SolicitudAlta,
} from "@/lib/cartera-alta-reglas";
import { pasaleEsto } from "../../alta/pasale-esto";
import { RevelarClave } from "../../RevelarClave";
import { NOMBRE_RUBRO, YA_EN_LA_CARTERA, esRubro, mensajeParaLaContadora, modulosDelAlta, sugerirPlan } from "../configurador-reglas";
import type { CierreDelPedido, ResultadoConfigurador, ResultadoDescarte } from "../configurador.server";
import { MOTIVOS_DE_DESCARTE, MOTIVOS_DE_DESCARTE_EN_ORDEN, NOTA_INTERNA_MAX, type MotivoDeDescarte } from "@/lib/soporte/avisos-a-la-contadora";
import {
  CAMPO_CONFIRMA_FACTURA_A_FUERA,
  NOMBRE_REGIMEN_FACTURA_A,
  REGIMENES_FACTURA_A,
  TEXTO_CONFIRMA_FACTURA_A_FUERA,
  avisoFacturaAFuera,
  esRegimenFacturaA,
  seEmiteFueraDelSistema,
  type RegimenFueraDelSistema,
} from "@/lib/fiscal/regimen-factura-a";
import { accionDelPedido, vistaDelPedido } from "../vista-del-pedido";
import { formatearCuit } from "@/lib/fiscal/cuit";
import { configurarSolicitudAction, descartarSolicitudAction } from "../actions";

interface Props {
  operador: string;
  /** El pedido ya figura cerrado en la base. La pantalla igual se monta: si el alta salió bien acá, manda «Pasale esto». */
  cerrada: boolean;
  /** Cómo se cerró (descartado o configurado), leído del servidor. */
  cierre: CierreDelPedido | null;
  pedido: {
    id: string;
    estudio: { id: string; nombre: string; whatsapp: string | null };
    datos: SolicitudAlta;
    pedidoPor: { nombre: string; email: string } | null;
    yaExisten: { id: string; nombre: string; slug: string; puntoVenta: number | null; enCartera: boolean }[];
    parecidos: { id: string; nombre: string; slug: string; subdominio: string | null; motivo: string }[];
  };
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <Bloque titulo={`${n} · ${titulo}`} id={`paso-${n}`}>
      <div className="grid gap-4 pt-3 md:grid-cols-2">{children}</div>
    </Bloque>
  );
}

function Copiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          setTimeout(() => setOk(false), 2000);
        } catch {
          setOk(false);
        }
      }}
    >
      {ok ? "Copiado" : etiqueta}
    </Button>
  );
}

/** «duenio» es el usuario del dueño de GSG en la consola (operator-auth.ts): se nombra como persona. */
const nombreDelOperador = (n: string) => (n.trim().toLowerCase() === "duenio" ? "el dueño de GSG" : n);

export function ConfiguradorClient({ operador, cerrada, cierre, pedido }: Props) {
  const d = pedido.datos;
  const existe = pedido.yaExisten.length > 0;
  const [f, setF] = useState({
    razonSocial: d.nombre,
    cuit: d.cuit,
    condicionIva: d.condicionIva ?? "",
    regimenFacturaA: "",
    confirmaFacturaAFuera: false,
    puntoVenta: d.puntoVenta ? String(d.puntoVenta) : "",
    email: d.email,
    whatsapp: d.whatsapp ?? "",
    alias: d.alias,
    tamanio: d.tamanio ?? "chico",
    fia: false,
    personas: "1",
    rubro: "mostrador",
    plan: "" as string,
    subdominio: "",
    accesoContadora: "ya-tiene",
    contadoraNombre: "",
    contadoraEmail: "",
    autorizaVinculo: false,
    duplicado: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  const tamanio = esTamanio(f.tamanio) ? f.tamanio : null;
  const sugerido = sugerirPlan(tamanio, {
    condicionIva: (CONDICIONES_IVA as readonly string[]).includes(f.condicionIva) ? (f.condicionIva as SolicitudAlta["condicionIva"]) : null,
    fia: f.fia,
    personas: Number(f.personas) || 0,
  });
  const plan: PlanId = (planesPosibles(tamanio) as string[]).includes(f.plan) ? (f.plan as PlanId) : sugerido.plan;
  // Chico (sólo factura): no se pregunta el rubro; nace con la vertical genérica, como el alta del estudio.
  const rubro = tamanio === "chico" ? "mostrador" : esRubro(f.rubro) ? f.rubro : "mostrador";
  const modulos = useMemo(() => modulosDelAlta(plan, rubro), [plan, rubro]);
  const que = accionDelPedido({ yaExisten: pedido.yaExisten, parecidos: pedido.parecidos, duplicado: f.duplicado, autorizaVinculo: f.autorizaVinculo });
  // «Vincular»: el negocio ya existe (por su CUIT, o Soporte eligió «Es este»). No se elige plan ni se crean usuarios.
  const vincula = existe || que.tipo === "cargar-cuit";
  const elegido = que.tipo === "cargar-cuit" ? pedido.parecidos.find((x) => x.id === que.tenantId) : undefined;
  const cuitLindo = formatearCuit(f.cuit) ?? f.cuit;

  const [r, accion, pendiente] = useActionState<ResultadoConfigurador | null, FormData>(async (previo, fd) => {
    // Si ya hay un resultado con contraseñas, una segunda respuesta no lo pisa.
    if (previo?.ok && !previo.yaConfigurada) return previo;
    return configurarSolicitudAction(previo, fd);
  }, null);

  const vista = vistaDelPedido(cerrada, r);
  if (vista === "pasale-esto" && r?.ok) return <PasaleEsto r={r} operador={operador} />;
  if (vista === "cerrado") {
    if (cierre?.tipo === "descartado") return <DescarteHecho cierre={cierre} estudioNombre={pedido.estudio.nombre} />;
    const ficha = cierre?.tipo === "configurado" ? cierre.clienteTenantId : null;
    return (
      <Franja>
        Este pedido ya está cerrado: el cliente quedó configurado. Si hace falta cambiar algo, se hace desde su ficha.{" "}
        {ficha && (
          <Link href={`/operador/tenants/${encodeURIComponent(ficha)}`} className="inline-flex min-h-11 items-center font-medium underline">
            Ir a la ficha del negocio
          </Link>
        )}
      </Franja>
    );
  }

  return (
    <>
    <form action={accion} className="space-y-8">
      <input type="hidden" name="solicitudId" value={pedido.id} />
      <input type="hidden" name="estudioTenantId" value={pedido.estudio.id} />
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="rubro" value={rubro} />
      <input type="hidden" name="autorizaVinculo" value={f.autorizaVinculo ? "si" : ""} />
      <input type="hidden" name={CAMPO_CONFIRMA_FACTURA_A_FUERA} value={f.confirmaFacturaAFuera ? "si" : ""} />
      <input type="hidden" name="duplicado" value={f.duplicado} />

      <Paso n={1} titulo="Estudio">
        <p className="text-sm md:col-span-2">
          Queda en la cartera de <b>{pedido.estudio.nombre}</b>
          {pedido.pedidoPor ? ` (lo pidió ${pedido.pedidoPor.nombre})` : ""}.
          {d.nota ? <span className="block text-muted">Nota del estudio: {d.nota}</span> : null}
        </p>
      </Paso>

      <Paso n={2} titulo="Cliente">
        <Field label="CUIT" htmlFor="cuit" hint="Se controla el dígito verificador. Copialo de la constancia de inscripción de ARCA." required>
          <Input id="cuit" name="cuit" inputMode="numeric" value={f.cuit} onChange={set("cuit")} className="min-h-11" />
        </Field>
        <Field label="Condición frente al IVA" htmlFor="condicionIva" required>
          <Select id="condicionIva" name="condicionIva" value={f.condicionIva} onChange={set("condicionIva")} className="min-h-11">
            <option value="">Elegí…</option>
            {CONDICIONES_IVA.map((c) => (
              <option key={c} value={c}>{NOMBRE_CONDICION_IVA[c]}</option>
            ))}
          </Select>
        </Field>
        {f.condicionIva === "RESPONSABLE_INSCRIPTO" && (
          <Field
            label="Qué Factura A le asignó ARCA"
            htmlFor="regimenFacturaA"
            required
            hint="Sin este dato no puede hacer Factura A (tampoco la de prueba). Si no lo sabés, consultalo con la contadora."
          >
            <Select id="regimenFacturaA" name="regimenFacturaA" value={f.regimenFacturaA} onChange={set("regimenFacturaA")} className="min-h-11">
              <option value="">Elegí una opción</option>
              {REGIMENES_FACTURA_A.map((x) => (
                <option key={x} value={x}>{NOMBRE_REGIMEN_FACTURA_A[x]}</option>
              ))}
            </Select>
          </Field>
        )}
        {/* «A con leyenda» o «M»: el sistema no las emite. Se dice ACÁ, al elegir, y se confirma (QA vuelta 7). */}
        {f.condicionIva === "RESPONSABLE_INSCRIPTO" && seEmiteFueraDelSistema(esRegimenFacturaA(f.regimenFacturaA) ? f.regimenFacturaA : null) && (
          <div role="alert" className="space-y-2 rounded-lg border border-warning/25 bg-warning-soft px-4 py-3 text-sm md:col-span-2">
            <p>{avisoFacturaAFuera(f.regimenFacturaA as RegimenFueraDelSistema)}</p>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" checked={f.confirmaFacturaAFuera} onChange={set("confirmaFacturaAFuera")} className="h-5 w-5" />
              {TEXTO_CONFIRMA_FACTURA_A_FUERA}.
            </label>
          </div>
        )}
        <Field label="Razón social" htmlFor="razonSocial" hint="Tal cual figura en la constancia de ARCA." required>
          <Input id="razonSocial" name="razonSocial" value={f.razonSocial} onChange={set("razonSocial")} className="min-h-11" />
        </Field>
        <Field label="Nombre en la cartera" htmlFor="alias" hint="Cómo lo ve la contadora. Vacío: la razón social.">
          <Input id="alias" name="alias" value={f.alias} onChange={set("alias")} className="min-h-11" />
        </Field>
        <Field label="Punto de venta" htmlFor="puntoVenta" hint="El que dio de alta en ARCA para factura electrónica." required>
          <Input id="puntoVenta" name="puntoVenta" inputMode="numeric" value={f.puntoVenta} onChange={set("puntoVenta")} className="min-h-11" />
        </Field>
        <Field label="WhatsApp del dueño" htmlFor="whatsapp" hint="Con característica, sin 0 ni 15.">
          <Input id="whatsapp" name="whatsapp" inputMode="tel" value={f.whatsapp} onChange={set("whatsapp")} className="min-h-11" />
        </Field>
        <Field label="Email del dueño (va a ser su usuario)" htmlFor="email" className="md:col-span-2" required>
          <Input id="email" name="email" type="email" value={f.email} onChange={set("email")} className="min-h-11 break-words" />
        </Field>
        {existe && que.tipo === "ya-en-cartera" && (
          <div className="md:col-span-2">
            <Franja tono="atencion">
              {YA_EN_LA_CARTERA} ({pedido.yaExisten.map((t) => t.nombre).join(", ")}). No hay nada que sumar: descartá el pedido
              (abajo) y avisale a la contadora.
            </Franja>
          </div>
        )}
        {!existe && pedido.parecidos.length > 0 && (
          <fieldset className="space-y-2 md:col-span-2">
            <legend className="text-sm font-semibold text-strong">¿Ya existe este negocio sin CUIT?</legend>
            <Franja tono="atencion">
              Ese CUIT no está en la plataforma, pero {pedido.parecidos.length === 1 ? "hay un negocio parecido" : `hay ${pedido.parecidos.length} negocios parecidos`}{" "}
              sin CUIT cargado. Si es el mismo, crear otro lo duplica. Revisalo y elegí una opción.
            </Franja>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="radio" name="duplicadoSel" value="otro" checked={f.duplicado === "otro"} onChange={set("duplicado")} className="h-5 w-5" />
              Es otro negocio: crear uno nuevo.
            </label>
            {pedido.parecidos.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-x-3">
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="radio" name="duplicadoSel" value={`es:${t.id}`} checked={f.duplicado === `es:${t.id}`} onChange={set("duplicado")} className="h-5 w-5" />
                  <span className="break-words">
                    Es este: <b>{t.nombre}</b> ({t.motivo}). Cargarle el CUIT y sumarlo a la cartera.
                  </span>
                </label>
                <a className="inline-flex min-h-11 items-center text-sm underline" href={`/operador/tenants/${encodeURIComponent(t.id)}`} target="_blank" rel="noreferrer">
                  Ver su ficha
                </a>
              </div>
            ))}
            {que.tipo === "cargar-cuit" && (
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" checked={f.autorizaVinculo} onChange={set("autorizaVinculo")} className="h-5 w-5" />
                El dueño de ese negocio autorizó que el estudio vea sus datos.
              </label>
            )}
          </fieldset>
        )}
        {existe && que.tipo !== "ya-en-cartera" && (
          <div className="space-y-2 md:col-span-2">
            <Franja tono="atencion">
              Ese CUIT ya tiene negocio en la plataforma:{" "}
              {pedido.yaExisten.map((t) => `${t.nombre}${t.puntoVenta ? ` (punto de venta ${t.puntoVenta})` : ""}`).join(", ")}. No se
              crea otro: se suma el existente a la cartera, con su plan, sus apps y sus usuarios. Eso le abre sus datos al estudio.
            </Franja>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" checked={f.autorizaVinculo} onChange={set("autorizaVinculo")} className="h-5 w-5" />
              El dueño de ese negocio autorizó que el estudio vea sus datos.
            </label>
          </div>
        )}
      </Paso>

      {!vincula && (
        <Paso n={3} titulo="Plan y rubro">
          <Field label="Tamaño" htmlFor="tamanio">
            <Select id="tamanio" value={f.tamanio} onChange={set("tamanio")} className="min-h-11">
              {TAMANIOS.map((t) => (
                <option key={t} value={t}>{NOMBRE_TAMANIO[t]}</option>
              ))}
            </Select>
          </Field>
          {tamanio === "varios-locales" && (
            <Franja tono="atencion" className="md:col-span-2">
              Se crea la casa (el primer local). Cada local más se da de alta después en «Dar de alta un negocio» →
              «¿De qué red?», eligiendo esta casa: hereda el CUIT y la condición frente al IVA, y le cargás su punto de venta.
            </Franja>
          )}
          {tamanio !== "chico" && (
            <Field label="Rubro" htmlFor="rubroSel">
              <Select id="rubroSel" value={rubro} onChange={set("rubro")} className="min-h-11">
                {RUBROS.map((x) => (
                  <option key={x} value={x}>{NOMBRE_RUBRO[x]}</option>
                ))}
              </Select>
            </Field>
          )}
          {tamanio === "comercio" && (
            <>
              <Field label="¿Cuántas personas lo van a usar?" htmlFor="personas">
                <Input id="personas" inputMode="numeric" value={f.personas} onChange={set("personas")} className="min-h-11" />
              </Field>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" checked={f.fia} onChange={set("fia")} className="h-5 w-5" />
                Le fía a clientes (cuenta corriente)
              </label>
            </>
          )}
          <Field label="Plan" htmlFor="planSel" hint={sugerido.porque}>
            <Select id="planSel" value={plan} onChange={set("plan")} className="min-h-11">
              {planesPosibles(tamanio).map((p) => (
                <option key={p} value={p}>{PLANES[p].nombre}{p === sugerido.plan ? " (sugerido)" : ""}</option>
              ))}
            </Select>
          </Field>
          <p className="text-sm text-muted md:col-span-2">
            Nace con lo que su plan y su rubro traen ({modulos.length} apps). Para sumar algo suelto, después, desde su ficha.
          </p>
          <Field label="Nombre corto para la dirección (opcional)" htmlFor="subdominio" hint="Minúsculas, números y guiones. Vacío: sin dirección por ahora.">
            <Input id="subdominio" name="subdominio" value={f.subdominio} onChange={set("subdominio")} className="min-h-11" />
          </Field>
        </Paso>
      )}

      <Paso n={vincula ? 3 : 4} titulo="Accesos">
        <p className="text-sm md:col-span-2">
          {vincula
            ? "El negocio conserva sus usuarios: no se crea ninguno."
            : `Al dueño se le crea el usuario ${f.email || "(email)"} con una contraseña temporal que vas a ver una sola vez.`}{" "}
          La contadora lo ve desde la cartera de su estudio; nunca queda como dueña del negocio del cliente.
        </p>
        <Field label="Acceso de la contadora" htmlFor="accesoContadora">
          <Select id="accesoContadora" name="accesoContadora" value={f.accesoContadora} onChange={set("accesoContadora")} className="min-h-11">
            <option value="ya-tiene">Ya tiene acceso{pedido.pedidoPor ? `: ${pedido.pedidoPor.email}` : ""}</option>
            <option value="nueva">Crear el acceso de otra persona del estudio</option>
          </Select>
        </Field>
        {f.accesoContadora === "nueva" && (
          <>
            <Field label="Nombre" htmlFor="contadoraNombre">
              <Input id="contadoraNombre" name="contadoraNombre" value={f.contadoraNombre} onChange={set("contadoraNombre")} className="min-h-11" />
            </Field>
            <Field label="Email" htmlFor="contadoraEmail">
              <Input id="contadoraEmail" name="contadoraEmail" type="email" value={f.contadoraEmail} onChange={set("contadoraEmail")} className="min-h-11" />
            </Field>
          </>
        )}
      </Paso>

      <Paso n={vincula ? 4 : 5} titulo="Revisar y crear">
        <p className="text-sm md:col-span-2 break-words">
          {que.tipo === "cargar-cuit" ? `Cargarle el CUIT a ${elegido?.nombre ?? "ese negocio"} y sumarlo a la cartera: ` : vincula ? "Sumar a la cartera: " : "Crear: "}
          <b>{f.razonSocial}</b> · CUIT {cuitLindo} · {(NOMBRE_CONDICION_IVA as Record<string, string>)[f.condicionIva] ?? "sin condición"} ·
          punto de venta {f.puntoVenta || "—"}
          {vincula ? "" : ` · ${PLANES[plan].nombre}`} · cartera de {pedido.estudio.nombre}.
        </p>
        {r && !r.ok && (
          <p role="alert" className="text-sm text-danger md:col-span-2">{r.error}</p>
        )}
        {que.tipo === "ya-en-cartera" ? (
          <p className="text-sm font-medium md:col-span-2">{YA_EN_LA_CARTERA}</p>
        ) : (
          <div className="md:col-span-2">
            <Button type="submit" disabled={pendiente || !que.habilitado}>
              {pendiente
                ? "Guardando…"
                : que.tipo === "cargar-cuit"
                  ? "Cargarle el CUIT y sumarlo a la cartera"
                  : que.tipo === "sumar"
                    ? "Sumar a la cartera"
                    : "Crear el cliente"}
            </Button>
          </div>
        )}
      </Paso>
    </form>
    <DescartarPedido
      solicitudId={pedido.id}
      estudioTenantId={pedido.estudio.id}
      estudioNombre={pedido.estudio.nombre}
      motivoInicial={que.tipo === "ya-en-cartera" ? "ya-en-cartera" : ""}
    />
    </>
  );
}

/** Lo que ve Soporte con el pedido ya descartado (al descartarlo y cada vez que lo vuelve a abrir). */
function DescarteHecho({ cierre, estudioNombre }: { cierre: Extract<CierreDelPedido, { tipo: "descartado" }>; estudioNombre: string }) {
  const cuando = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" }).format(
    new Date(cierre.cuando),
  );
  return (
    <Franja>
      <span className="block">
        Pedido descartado{cierre.operador ? ` por ${cierre.operador}` : ""} el {cuando}. {estudioNombre} ve en su cartera: «{cierre.texto}»
      </span>
      {cierre.nota && <span className="block break-words">Nota interna (sólo la ve Soporte GSG): {cierre.nota}</span>}
      <Link href="/operador/solicitudes" className="inline-flex min-h-11 items-center font-medium underline">
        Volver a los pedidos
      </Link>
    </Franja>
  );
}

/**
 * Descartar el pedido (datos mal, duplicado, no corresponde): queda cerrado y el estudio puede volver a
 * pedirlo. La contadora lee SÓLO un motivo de la lista cerrada; la nota es interna de Soporte.
 */
function DescartarPedido({
  solicitudId,
  estudioTenantId,
  estudioNombre,
  motivoInicial,
}: {
  solicitudId: string;
  estudioTenantId: string;
  estudioNombre: string;
  motivoInicial: MotivoDeDescarte | "";
}) {
  const [r, accion, pendiente] = useActionState<ResultadoDescarte | null, FormData>(descartarSolicitudAction, null);
  if (r?.ok) {
    return (
      <Franja>
        Pedido descartado. {estudioNombre} ve en su cartera: «{MOTIVOS_DE_DESCARTE[r.motivo]}»{" "}
        <Link href="/operador/solicitudes" className="inline-flex min-h-11 items-center font-medium underline">Volver a los pedidos</Link>
      </Franja>
    );
  }
  const errorMotivo = r && !r.ok && r.campo === "motivo" ? r.error : null;
  const errorNota = r && !r.ok && r.campo === "nota" ? r.error : null;
  const errorGeneral = r && !r.ok && !r.campo ? r.error : null;
  return (
    <form action={accion} className="mt-8 space-y-3" noValidate>
      <Bloque titulo="¿No corresponde crearlo?" id="descartar">
        <div className="grid gap-3 pt-3">
          <input type="hidden" name="solicitudId" value={solicitudId} />
          <input type="hidden" name="estudioTenantId" value={estudioTenantId} />
          <fieldset className="grid gap-1" aria-describedby={errorMotivo ? "motivo-descarte-error" : undefined}>
            <legend className="text-sm font-medium text-strong">Qué ve la contadora en su cartera</legend>
            {MOTIVOS_DE_DESCARTE_EN_ORDEN.map((m) => (
              <label key={m} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input type="radio" name="motivo" value={m} defaultChecked={m === motivoInicial} className="h-5 w-5 shrink-0" />
                {MOTIVOS_DE_DESCARTE[m]}
              </label>
            ))}
            {errorMotivo && <p id="motivo-descarte-error" className="text-sm text-danger">{errorMotivo}</p>}
          </fieldset>
          <Field
            label="Nota interna (optativa)"
            htmlFor="nota-descarte"
            hint={`Sólo la ve Soporte GSG: la contadora no la lee nunca. Hasta ${NOTA_INTERNA_MAX} letras.`}
          >
            <Textarea
              id="nota-descarte"
              name="nota"
              maxLength={NOTA_INTERNA_MAX}
              rows={2}
              aria-invalid={errorNota ? true : undefined}
              aria-describedby={errorNota ? "nota-descarte-error" : undefined}
            />
          </Field>
          {errorNota && <p id="nota-descarte-error" className="text-sm text-danger">{errorNota}</p>}
          {errorGeneral && <p className="text-sm text-danger">{errorGeneral}</p>}
          <p className="sr-only" role="status" aria-live="polite">{errorMotivo ?? errorNota ?? errorGeneral ?? ""}</p>
          <div>
            <Button type="submit" variant="outline" className="min-h-11" disabled={pendiente}>
              {pendiente ? "Descartando…" : "Descartar el pedido"}
            </Button>
          </div>
        </div>
      </Bloque>
    </form>
  );
}

function PasaleEsto({ r, operador }: { r: Extract<ResultadoConfigurador, { ok: true }>; operador: string }) {
  const cliente = r.usuarios.find((u) => u.quien === "cliente");
  const contadora = r.usuarios.find((u) => u.quien === "contadora");
  const alDuenio = cliente
    ? pasaleEsto({ negocio: r.nombre, direccion: r.direccion, usuario: cliente.email, clave: cliente.clave, otrosLocales: r.otrosLocales, facturaAFuera: r.facturaAFuera })
    : null;
  const aLaContadora = mensajeParaLaContadora({
    cliente: r.nombre,
    cuit: r.cuit,
    puntoVenta: r.puntoVenta,
    direccionCartera: r.estudio.direccionCartera,
    acceso: contadora?.clave ? { usuario: contadora.email, clave: contadora.clave } : null,
  });
  const cuando = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(r.auditoria.cuando));

  return (
    <div className="space-y-8">
      <Bloque titulo="6 · Pasale esto">
        <div className="space-y-4 pt-3">
          {r.yaConfigurada && (
            <Franja>
              Este cliente ya se había configurado con este mismo pedido. Las contraseñas se muestran una sola vez: si no las tenés,
              generá una nueva en la ficha, en Personas.
            </Franja>
          )}
          {r.avisos.map((a) => (
            <Franja key={a} tono="atencion">{a}</Franja>
          ))}
          {alDuenio && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-strong">Para el dueño del negocio</h3>
              {alDuenio.estado !== "con-direccion" && (
                <Franja tono="atencion">
                  Este negocio todavía no tiene dirección para entrar. Hasta que la tenga, no le mandes la contraseña: el mensaje ya dice
                  que la dirección se la pasás cuando esté lista.
                </Franja>
              )}
              {cliente?.clave && <RevelarClave clave={cliente.clave} para={cliente.email} />}
              <pre className="whitespace-pre-wrap break-words rounded bg-surface-sunken p-3 text-sm">{alDuenio.mensaje}</pre>
              <div className="flex flex-wrap gap-2">
                <Copiar texto={alDuenio.mensaje} etiqueta={alDuenio.estado === "con-direccion" ? "Copiar" : "Copiar igual"} />
                <a
                  className="inline-flex min-h-11 items-center rounded border border-line-strong px-4 text-sm"
                  href={waLinkClienta(r.whatsappCliente, alDuenio.mensaje) ?? buildWhatsAppHref("", alDuenio.mensaje)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {alDuenio.estado === "con-direccion" ? "Mandar por WhatsApp" : "Mandar igual"}
                </a>
              </div>
            </section>
          )}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-strong">Para la contadora</h3>
            {contadora?.clave && <RevelarClave clave={contadora.clave} para={contadora.email} />}
            <pre className="whitespace-pre-wrap break-words rounded bg-surface-sunken p-3 text-sm">{aLaContadora}</pre>
            <div className="flex flex-wrap gap-2">
              <Copiar texto={aLaContadora} etiqueta="Copiar" />
              <a
                className="inline-flex min-h-11 items-center rounded border border-line-strong px-4 text-sm"
                href={buildWhatsAppHref("", aLaContadora)}
                target="_blank"
                rel="noreferrer"
              >
                Mandar por WhatsApp
              </a>
            </div>
          </section>
          <p className="text-[13px] text-muted">
            Quedó registrado: lo {r.creado ? "dio de alta" : "sumó a la cartera"} {nombreDelOperador(r.auditoria.operador || operador)} el {cuando}{" "}
            (Historial de la ficha).
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <a className="inline-flex min-h-11 items-center underline" href={`/operador/tenants/${encodeURIComponent(r.clienteTenantId)}`}>
              Ir a la ficha del negocio
            </a>
            <a className="inline-flex min-h-11 items-center underline" href={`/operador/tenants/${encodeURIComponent(r.estudio.id)}`}>
              Ir a la ficha del estudio
            </a>
            <Link className="inline-flex min-h-11 items-center underline" href="/operador/solicitudes">
              Volver a los pedidos
            </Link>
          </div>
        </div>
      </Bloque>
    </div>
  );
}
