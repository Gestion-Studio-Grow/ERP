import Link from "next/link";
import { notFound } from "next/navigation";
import { operatorPrisma } from "@/lib/operator-db";
import { requireSesionOperador } from "@/lib/operator-session";
import { decidirOperadorParaNegocios } from "@/lib/operador/guardia-negocio-core";
import { getBlueprint } from "@/blueprints";
import {
  setTenantStatus,
  setTenantPlan,
  setTenantBranding,
  setTenantSubdomain,
  setTenantArcaCuit,
  setTenantArcaPuntoVenta,
  cargarCredencialFiscal,
} from "@/lib/operator-actions";
import {
  checklistApertura,
  evaluarListoParaFacturar,
  type EstadoApertura,
} from "@/lib/operador/checklist-apertura";
import { MODULES, PLANS, TENANT_STATUSES } from "@/lib/operator-config";
import {
  ACCENT_PRESETS,
  ACCENT_PRESET_LABELS,
  type AccentPreset,
} from "@/lib/branding";
import {
  Bloque,
  Button,
  Field,
  Franja,
  Input,
  LineaDeEstado,
  Marca,
  Renglon,
  Select,
  Textarea,
  atributosBoton,
  fmtCuit,
} from "@/components/ui";
import { modoDesdeEnv } from "@/plugins/arca";
import { operatorReadMustChange } from "@/lib/must-change-password";
import { parseTenantHostMap } from "@/lib/tenant";
import {
  direccionDelLocal,
  MOTIVO_OK_DEL_DUENIO_RED,
} from "@/lib/multilocal/multilocal-core";
import { catalogo } from "@/modules/catalog";
import { INTERRUPTORES, interruptorPorId } from "@/cambios/interruptores";
import { todosApagados } from "@/cambios/interruptores-core";
import { operadorDuenio } from "@/lib/operator-auth";
import { ResetOwnerPasswordCard } from "./ResetOwnerPasswordCard";
import {
  appsPorModulo,
  estadoDeApps,
  planFijarAsignacion,
  requiereOkDelDuenio,
  vistaPreviaDeCambio,
  MOTIVO_OK_DEL_DUENIO,
} from "./apps-del-negocio";
import {
  candidatosEnOtraRed,
  flagsDeApps,
  leerInterruptoresDe,
  leerNegocioParaActivar,
  leerRedDeLaFicha,
} from "./negocio.server";
import { InterruptoresCard } from "./InterruptoresCard";
import { RedDeLocalesCard, type CandidatoLocal } from "./RedDeLocalesCard";
import {
  AppsDelNegocioCard,
  frasesDeCambioDeModulo,
  type CambioRegistrado,
  type FilaModuloFicha,
} from "./AppsDelNegocioCard";
import {
  choqueDePuntoDeVenta,
  listaDePuntosUsados,
  puntosDeVentaUsados,
  type NegocioFiscal,
} from "./candado-punto-venta";
import FichaConPestanas, { type PestanaDeFicha } from "./FichaConPestanas";
import {
  estadoEnPalabras,
  leerPestana,
  nombreDePestana,
  pestanaQueResuelve,
  planEnPalabras,
  rubroEnPalabras,
  type EstadoTenant,
} from "../../negocios-core";

export const dynamic = "force-dynamic";

// ============================================================================
// LA FICHA DE UN NEGOCIO (consola GSG) — un legajo con separadores.
// ============================================================================
//
// Antes era un scroll de 6.000 px con quince formularios apilados. Ahora, arriba quién es (nombre,
// estado, rubro, plan, personas) y la tecla que más se usa (abrir su panel); abajo, seis pestañas
// por trabajo, cada una con lo suyo y nada más:
//   Puesta en marcha — «Listo para abrir» como guía, el estado del negocio y su link.
//   Fiscal           — el estado fiscal de un vistazo y los tres pasos (CUIT, punto de venta, certificado).
//   Plan y apps      — el plan, los interruptores, los módulos con vista previa y la red de locales.
//   Marca y vidriera — el color y el tema de su vidriera.
//   Personas         — la contraseña del dueño.
//   Historial        — lo que GSG cambió acá: interruptores y módulos, con quién y cuándo.
//
// Lo que se lee y lo que se guarda es lo mismo que antes (las mismas actions con los mismos campos):
// cambia el orden y la forma. Las lecturas independientes van a la vez (antes, una detrás de otra).
// CROSS-TENANT por la conexión de operador; la guardia va en la página (y en cada action).

// Estado de la credencial fiscal del negocio (metadatos no sensibles). Tolerante a que la migración
// `TenantFiscalCredential` no esté aplicada (Gate 2): sin la tabla devuelve «pendiente».
async function credencialFiscalDe(
  tenantId: string,
): Promise<
  | { certCuit: string; certNotAfter: Date | null; updatedAt: Date }
  | null
  | "pendiente"
> {
  try {
    const r = await operatorPrisma.tenantFiscalCredential.findUnique({
      where: { tenantId },
      select: { certCuit: true, certNotAfter: true, updatedAt: true },
    });
    return r ?? null;
  } catch {
    return "pendiente";
  }
}

function blueprintLabel(id: string | null): string | null {
  if (!id) return null;
  try {
    return getBlueprint(id).label;
  } catch {
    return id;
  }
}

const MODO_ARCA_LABEL: Record<string, string> = {
  stub: "Simulado (no emite)",
  homologacion: "Homologación (de prueba)",
  real: "Producción (con validez fiscal)",
};

const fecha = (d: Date) =>
  d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "short",
  });
const dia = (d: Date) =>
  d.toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

// Los «ok» cortos de las acciones viejas (?ok=estado) se dicen enteros; el resto ya trae el mensaje.
const OK_CORTOS = new Map<string, string>([
  ["estado", "Estado guardado."],
  ["plan", "Plan guardado."],
  ["branding", "Marca guardada."],
  ["link", "Subdominio guardado."],
]);

const ACCIONES_DE_MODULOS = [
  "module.activate",
  "module.deactivate",
  "module.fijar-asignacion",
];

/** Un arreglo de ids de la auditoría (`changes` es JSON libre). `null` si el dato no está. */
function idsDe(valor: unknown): string[] | null {
  return Array.isArray(valor)
    ? valor.filter((x): x is string => typeof x === "string")
    : null;
}

/** Los últimos cambios de módulos del negocio, con el antes y el después que dejó la action. */
async function historialDeModulos(
  tenantId: string,
): Promise<CambioRegistrado[]> {
  const filas = await operatorPrisma.auditLog.findMany({
    where: { tenantId, action: { in: ACCIONES_DE_MODULOS } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      createdAt: true,
      actor: true,
      action: true,
      changes: true,
    },
  });
  return filas.map((f) => {
    const c = (
      f.changes && typeof f.changes === "object" && !Array.isArray(f.changes)
        ? f.changes
        : {}
    ) as Record<string, unknown>;
    return {
      id: f.id,
      cuando: f.createdAt,
      actor: f.actor,
      accion: f.action,
      modulo: typeof c.modulo === "string" ? c.modulo : null,
      sumados:
        idsDe(
          f.action === "module.fijar-asignacion" ? c.agregados : c.incluidos,
        ) ?? [],
      antes: idsDe(c.antes),
      // La vidriera del dueño (/admin/modulos) auditaba sólo el resultado, como `modules`.
      despues: idsDe(c.despues) ?? idsDe(c.modules),
    };
  });
}

export default async function FichaDelNegocio({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    ok?: string;
    error?: string;
    modulo?: string;
    pestana?: string;
  }>;
}) {
  // Guardia en la página, no sólo en el layout: el layout no se vuelve a ejecutar al navegar del
  // lado del cliente, y esta ficha lee y cambia datos de cualquier negocio.
  const sesion = await requireSesionOperador();
  const { id } = await params;
  const { created, ok, error, modulo, pestana } = await searchParams;

  const tenant = await operatorPrisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      plan: true,
      blueprintId: true,
      subdomain: true,
      modules: true,
      accentPreset: true,
      frontTheme: true,
      createdAt: true,
      arcaCuit: true,
      arcaPuntoVenta: true,
      arcaHomologacion: true,
      _count: {
        select: {
          users: true,
          services: true,
          products: true,
          appointments: true,
          orders: true,
          clients: true,
        },
      },
    },
  });
  if (!tenant) notFound();
  const t = tenant!;
  const esCasa = t.modules.includes("multilocal");

  // Todo lo que no depende de otra lectura, a la vez.
  const [
    credFiscal,
    ownerYEstado,
    contacto,
    productos,
    usuariosActivos,
    otrosDelCuit,
    negocio,
    interruptores,
    historial,
    red,
    candidatosCasa,
  ] = await Promise.all([
    credencialFiscalDe(t.id),
    // Dueño del negocio + estado de su contraseña temporal (tolera la migración sin aplicar).
    operatorPrisma.user
      .findFirst({
        where: { tenantId: t.id, role: "OWNER", active: true, deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true },
      })
      .then(async (owner) => ({
        owner,
        tempPending: owner
          ? await operatorReadMustChange(operatorPrisma, owner.id)
          : (false as const),
      })),
    // Datos de apertura: contacto público y catálogo, tolerantes a que falten.
    operatorPrisma.businessSettings
      .findUnique({
        where: { tenantId: t.id },
        select: { addressLine: true, instagram: true, whatsapp: true },
      })
      .catch(() => null),
    operatorPrisma.product
      .findMany({
        where: { tenantId: t.id, deletedAt: null },
        select: { name: true, price: true, pricePerKg: true },
        take: 300, // techo defensivo: el chequeo compara contra el catálogo semilla (~20 ítems)
      })
      .catch(() => []),
    operatorPrisma.user.count({
      where: { tenantId: t.id, active: true, deletedAt: null },
    }),
    // Candado fiscal: los otros negocios con este CUIT.
    t.arcaCuit
      ? operatorPrisma.tenant.findMany({
          where: { arcaCuit: t.arcaCuit, id: { not: t.id } },
          select: {
            id: true,
            name: true,
            slug: true,
            arcaCuit: true,
            arcaPuntoVenta: true,
          },
        })
      : Promise.resolve([] as NegocioFiscal[]),
    leerNegocioParaActivar(t.id),
    // Los interruptores de este negocio, leídos de la base. Si no se pudo, la vista previa mira
    // como apagado y la ficha no ofrece cambiarlos.
    leerInterruptoresDe(t.id),
    historialDeModulos(t.id),
    leerRedDeLaFicha(t.id),
    // Los que se le pueden sumar a una red: ni casas, ni estudios, ni CH (sólo con el OK del dueño).
    esCasa
      ? operatorPrisma.tenant
          .findMany({
            where: { id: { not: t.id } },
            orderBy: { name: "asc" },
            select: { id: true, name: true, slug: true, modules: true },
          })
          .then((ts) =>
            ts.filter(
              (x) =>
                !x.modules.includes("multilocal") &&
                !x.modules.includes("cartera") &&
                !requiereOkDelDuenio(x.slug),
            ),
          )
      : Promise.resolve([] as { id: string; name: string; slug: string }[]),
  ]);
  if (!negocio) notFound();
  const { owner, tempPending: ownerTempPending } = ownerYEstado;
  const enOtraRed = await candidatosEnOtraRed(
    candidatosCasa.map((x) => x.id),
    t.id,
  );
  const candidatosRed: CandidatoLocal[] = candidatosCasa.map(
    ({ id: cid, name, slug }) => ({
      id: cid,
      name,
      slug,
      enOtraRed: enOtraRed.get(cid) ?? null,
    }),
  );

  // Estado fiscal derivado.
  const modoArca = modoDesdeEnv();
  const credLoaded =
    credFiscal && credFiscal !== "pendiente" ? credFiscal : null;
  const cuitOk = !!t.arcaCuit;
  const certOk = !!credLoaded;
  const puntoVentaOk =
    typeof t.arcaPuntoVenta === "number" && t.arcaPuntoVenta > 0;
  const certVence = credLoaded?.certNotAfter
    ? credLoaded.certNotAfter.toISOString().slice(0, 10)
    : null;
  const cuitCertMismatch = !!(
    credLoaded &&
    cuitOk &&
    credLoaded.certCuit !== t.arcaCuit
  );

  const estadoApertura: EstadoApertura = {
    slug: t.slug,
    blueprintId: t.blueprintId,
    subdomain: t.subdomain,
    usuariosActivos,
    arcaCuit: t.arcaCuit,
    arcaPuntoVenta: t.arcaPuntoVenta,
    arcaHomologacion: t.arcaHomologacion,
    certificadoCargado: credFiscal === "pendiente" ? null : certOk,
    certCuit: credLoaded?.certCuit ?? null,
    modoArca,
    // HOY siempre false: la columna `arcaCondicionIva` está declarada schema-ahead en
    // src/lib/fiscal.ts pero su migración NO está aplicada. Importa porque en producción fiscal sin
    // condición de IVA `construirPerfilFiscal` lanza y la factura no sale.
    condicionIvaDisponible: false,
    contacto,
    productos,
  };
  // El semáforo sale del MISMO evaluador que el checklist y copia las condiciones de
  // `construirPerfilFiscal` (antes daba verde sin punto de venta).
  const fiscal = evaluarListoParaFacturar(estadoApertura);
  const apertura = checklistApertura(estadoApertura);
  const choquePv = choqueDePuntoDeVenta(
    { tenantId: t.id, cuit: t.arcaCuit, puntoVenta: t.arcaPuntoVenta },
    otrosDelCuit,
  );
  const pvUsados = puntosDeVentaUsados(t.id, t.arcaCuit, otrosDelCuit);

  // Apps del negocio: lo que ve hoy, si su asignación lo reproduce con el Inicio por apps, y la vista
  // previa del módulo que se quiere cambiar (`?modulo=`). Todo sale de apps-del-negocio.ts.
  const cat = catalogo();
  const flags = flagsDeApps(interruptores?.estado ?? todosApagados());
  const duenio = operadorDuenio();
  const paraEsteOperador = decidirOperadorParaNegocios(sesion, [t.slug]);
  const soloLectura = paraEsteOperador.ok
    ? null
    : paraEsteOperador.motivo.replace(" No se hizo nada.", "");
  const estadoApps = estadoDeApps(negocio!, flags, cat);
  const fijar = planFijarAsignacion(negocio!, flags, cat);
  const appsDeCadaModulo = appsPorModulo();
  const activos = new Set(negocio!.modules);
  const filasModulos: FilaModuloFicha[] = MODULES.map((m) => ({
    id: m.id,
    nombre: m.label,
    descripcion: m.description,
    plugin: !!m.plugin,
    activo: activos.has(m.id),
    apps: appsDeCadaModulo.get(m.id) ?? 0,
  }));
  const moduloPrevia = modulo?.trim() || null;
  const accionPrevia =
    moduloPrevia && activos.has(moduloPrevia) ? "desactivar" : "activar";
  const previa = moduloPrevia
    ? ({
        moduloId: moduloPrevia,
        modulo: filasModulos.find((m) => m.id === moduloPrevia) ?? null,
        accion: accionPrevia,
        plan: vistaPreviaDeCambio(
          negocio!,
          { accion: accionPrevia, modulo: moduloPrevia },
          flags,
          cat,
        ),
      } as const)
    : null;

  const conCandado = requiereOkDelDuenio(negocio!.slug);
  const estado = estadoEnPalabras(t.status as EstadoTenant);
  const plan = planEnPalabras(t.plan);
  const rubro = rubroEnPalabras(blueprintLabel(t.blueprintId));
  const suPanel = direccionDelLocal(
    t.subdomain,
    {
      mapaDeHosts: parseTenantHostMap(process.env.TENANT_HOST_MAP),
      dominioPropio: process.env.APP_BASE_DOMAIN?.trim() || null,
    },
    "/admin",
  );
  const pendientesFiscal = fiscal.listo ? 0 : fiscal.faltantes.length;

  // ── Los paneles ─────────────────────────────────────────────────────────────

  const puesta = (
    <>
      <Bloque
        id="listo"
        titulo="Listo para abrir"
        cuenta={
          apertura.listo
            ? "sin pendientes"
            : `${apertura.pendientes} ${apertura.pendientes === 1 ? "pendiente" : "pendientes"}`
        }
        nota="Lo que el alta no hace sola, leído del negocio"
      >
        {apertura.items.map((i) => {
          const donde = pestanaQueResuelve(i);
          return (
            <Renglon
              key={i.id}
              folio={
                i.ok === null ? (
                  <Marca tipo="pendiente">No aplica</Marca>
                ) : i.ok ? (
                  <Marca tipo="hecho">Listo</Marca>
                ) : (
                  <Marca tipo="atencion">Falta</Marca>
                )
              }
              titulo={i.label}
              detalle={
                <>
                  {i.detalle}
                  {i.ok === false && (
                    <span className="mt-0.5 block text-warning">
                      {i.porQue}
                    </span>
                  )}
                </>
              }
              tecla={
                i.ok === false && donde !== "puesta" ? (
                  <Link
                    href={`?pestana=${donde}`}
                    {...atributosBoton("outline", "sm")}
                    className="inline-flex items-center whitespace-nowrap"
                  >
                    {nombreDePestana(donde)}
                  </Link>
                ) : i.ok === false &&
                  (i.id === "direccion" ||
                    i.id === "instagram" ||
                    i.id === "precios") ? (
                  <span className="text-[12px] text-muted">
                    lo carga el negocio
                  </span>
                ) : null
              }
            />
          );
        })}
      </Bloque>

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <Bloque
            titulo="Estado del negocio"
            nota={
              t.status === "ACTIVE"
                ? "En producción: está vendiendo de verdad"
                : undefined
            }
          >
            <form
              action={setTenantStatus}
              className="flex flex-wrap items-end gap-2 py-3"
            >
              <input type="hidden" name="tenantId" value={t.id} />
              <Field
                label="Estado"
                htmlFor="ficha-estado"
                className="min-w-48 flex-1"
              >
                <Select id="ficha-estado" name="status" defaultValue={t.status}>
                  {TENANT_STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {estadoEnPalabras(s.id).texto}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="outline">
                Guardar
              </Button>
            </form>
          </Bloque>
        </div>

        <div>
          <Bloque
            titulo="Link propio"
            nota="La dirección del negocio: única en la plataforma"
          >
            <form
              action={setTenantSubdomain}
              className="flex flex-wrap items-end gap-2 py-3"
            >
              <input type="hidden" name="tenantId" value={t.id} />
              <Field
                label="Subdominio"
                htmlFor="ficha-sub"
                className="min-w-48 flex-1"
              >
                <Input
                  id="ficha-sub"
                  name="subdomain"
                  defaultValue={t.subdomain ?? ""}
                  placeholder="estetica-norte"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
              <Button type="submit" variant="outline">
                Guardar
              </Button>
            </form>
          </Bloque>
        </div>
      </div>
    </>
  );

  const fiscalPanel = (
    <>
      {fiscal.listo ? (
        <Franja>
          Listo para facturar en modo <b>{MODO_ARCA_LABEL[modoArca]}</b>.
        </Franja>
      ) : (
        <Franja tono="atencion">
          <b>Todavía no puede facturar.</b> Si vende así, el cobro entra igual y
          la factura no sale: el descuadre aparece a fin de mes.
          {fiscal.bloqueadoPorMigracion && (
            <>
              {" "}
              Hay faltantes que no se resuelven desde acá: necesitan una
              migración aprobada por el dueño.
            </>
          )}
        </Franja>
      )}
      {choquePv && (
        <Franja tono="peligro">
          El punto de venta <b>{t.arcaPuntoVenta}</b> de este CUIT también lo
          tiene «{choquePv.name}» ({choquePv.slug}). Los dos numeran el mismo
          talonario en ARCA y las facturas se rechazan: cargale a uno de los dos
          un punto de venta propio.
        </Franja>
      )}
      {cuitCertMismatch && (
        <Franja tono="peligro">
          El CUIT del negocio ({fmtCuit(t.arcaCuit)}) no coincide con el del
          certificado cargado ({fmtCuit(credLoaded!.certCuit)}). La firma lo va
          a rechazar: corregí el CUIT o volvé a cargar el certificado del CUIT
          correcto.
        </Franja>
      )}

      <Bloque
        id="fiscal"
        titulo="De un vistazo"
        nota="Para emitir: el CUIT, el punto de venta y el certificado, en ese orden"
      >
        <Renglon
          folio={
            <Marca tipo={cuitOk ? "hecho" : "atencion"}>
              {cuitOk ? "Listo" : "Falta"}
            </Marca>
          }
          titulo="CUIT del emisor"
          detalle="Se valida el dígito verificador."
          plata={
            <span className="font-mono text-[14px] text-strong">
              {cuitOk ? fmtCuit(t.arcaCuit) : "sin cargar"}
            </span>
          }
        />
        <Renglon
          folio={
            <Marca tipo={puntoVentaOk ? "hecho" : "atencion"}>
              {puntoVentaOk ? "Listo" : "Falta"}
            </Marca>
          }
          titulo="Punto de venta"
          detalle={
            pvUsados.length > 0
              ? `Este CUIT ya usa en otros negocios: ${listaDePuntosUsados(pvUsados)}.`
              : "El que ARCA habilitó para este CUIT."
          }
          plata={
            <span className="font-mono text-[14px] text-strong">
              {puntoVentaOk ? String(t.arcaPuntoVenta) : "sin cargar"}
            </span>
          }
        />
        <Renglon
          folio={
            credFiscal === "pendiente" ? (
              <Marca tipo="pendiente">Sin dato</Marca>
            ) : certOk ? (
              <Marca tipo="hecho">Listo</Marca>
            ) : (
              <Marca tipo="atencion">Falta</Marca>
            )
          }
          titulo="Certificado de ARCA"
          detalle={
            credFiscal === "pendiente"
              ? "La tabla de credenciales todavía no está en la base (migración pendiente)."
              : credLoaded
                ? `CUIT del certificado ${fmtCuit(credLoaded.certCuit)} · actualizado ${credLoaded.updatedAt.toISOString().slice(0, 10)}`
                : "Primero el CUIT y el punto de venta; después el certificado."
          }
          plata={
            <span className="text-[14px] text-strong">
              {certVence ? `vence ${certVence}` : "—"}
            </span>
          }
        />
        <Renglon
          folio={
            <Marca tipo={modoArca === "stub" ? "atencion" : "hecho"}>
              Plataforma
            </Marca>
          }
          titulo="Modo de ARCA de la plataforma"
          detalle="Es de todo el sistema, no de este negocio."
          plata={
            <span className="text-[14px] text-strong">
              {MODO_ARCA_LABEL[modoArca]}
            </span>
          }
        />
        {!fiscal.listo && fiscal.faltantes.length > 0 && (
          <p className="border-b border-line py-3 text-[13px] text-warning">
            Falta: {fiscal.faltantes.join(" · ")}.
          </p>
        )}
      </Bloque>

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <Bloque titulo="Paso 1 · CUIT del emisor">
            <form action={setTenantArcaCuit} className="space-y-2 py-3">
              <input type="hidden" name="tenantId" value={t.id} />
              <Field
                label="CUIT"
                htmlFor="ficha-cuit"
                hint="11 números, con o sin guiones. Vacío lo borra."
              >
                <Input
                  id="ficha-cuit"
                  name="arcaCuit"
                  defaultValue={t.arcaCuit ?? ""}
                  placeholder="20-30405060-7"
                  inputMode="numeric"
                  autoComplete="off"
                  className="font-mono"
                />
              </Field>
              <Button type="submit" variant="outline">
                Guardar el CUIT
              </Button>
            </form>
          </Bloque>
        </div>
        <div>
          <Bloque titulo="Paso 2 · Punto de venta de ARCA">
            <form action={setTenantArcaPuntoVenta} className="space-y-2 py-3">
              <input type="hidden" name="tenantId" value={t.id} />
              <Field
                label="Punto de venta"
                htmlFor="ficha-pv"
                hint="De 1 a 99999. Sin esto el cobro entra y la factura no sale. Vacío lo borra."
              >
                <Input
                  id="ficha-pv"
                  name="arcaPuntoVenta"
                  defaultValue={t.arcaPuntoVenta ?? ""}
                  placeholder="4"
                  inputMode="numeric"
                  autoComplete="off"
                  className="font-mono"
                />
              </Field>
              <Button type="submit" variant="outline">
                Guardar el punto de venta
              </Button>
            </form>
          </Bloque>
        </div>
      </div>

      <Bloque
        titulo="Paso 3 · Certificado de ARCA"
        nota="Se firma sólo si el CUIT del certificado es el del negocio · nunca se muestra ni se registra"
      >
        {!cuitOk && credFiscal !== "pendiente" && (
          <p
            role="alert"
            className="border-b border-line py-3 text-sm text-warning"
          >
            Cargá el CUIT (paso 1) antes del certificado: se compara el CUIT del
            certificado contra el del negocio.
          </p>
        )}
        {credFiscal === "pendiente" ? (
          <p role="alert" className="py-3 text-sm text-warning">
            Todavía no se pueden cargar certificados: falta el cambio en la
            base que guarda las credenciales de facturación de cada negocio.
            Pedíselo a quien administra la base.
          </p>
        ) : (
          <form
            action={cargarCredencialFiscal}
            className="grid gap-3 py-3 lg:grid-cols-2"
          >
            <input type="hidden" name="tenantId" value={t.id} />
            <Field label="Certificado (PEM)" htmlFor="ficha-cert">
              <Textarea
                id="ficha-cert"
                name="certPem"
                rows={4}
                required
                placeholder={
                  "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
                }
                className="font-mono text-xs"
              />
            </Field>
            <Field label="Clave privada (PEM)" htmlFor="ficha-clave">
              <Textarea
                id="ficha-clave"
                name="keyPem"
                rows={4}
                required
                placeholder={
                  "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
                }
                className="font-mono text-xs"
              />
            </Field>
            <div className="lg:col-span-2">
              <Button type="submit" variant="outline">
                {credLoaded ? "Rotar el certificado" : "Cargar el certificado"}
              </Button>
            </div>
          </form>
        )}
      </Bloque>
    </>
  );

  const planPanel = (
    <>
      <Bloque
        titulo="Plan"
        cuenta={plan.nota ? `${plan.texto} · ${plan.nota}` : plan.texto}
      >
        <form
          action={setTenantPlan}
          className="flex flex-wrap items-end gap-2 py-3"
        >
          <input type="hidden" name="tenantId" value={t.id} />
          <Field
            label="Plan comercial"
            htmlFor="ficha-plan"
            className="min-w-48 flex-1"
          >
            <Select id="ficha-plan" name="plan" defaultValue={t.plan ?? ""}>
              <option value="">Sin plan</option>
              {PLANS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="outline">
            Guardar
          </Button>
        </form>
        <p className="border-t border-line py-2 text-[13px] text-muted">
          Los planes nuevos (Facturación, Micro comerciante, Comerciante, PyME,
          Estudio) todavía no se asignan desde acá: los precios y límites son
          provisionales a confirmar.
        </p>
      </Bloque>

      <InterruptoresCard
        tenantId={t.id}
        slug={t.slug}
        modulosVistos={negocio!.modules}
        estados={interruptores?.estado ?? null}
        apps={estadoApps}
        candado={conCandado ? { puedeTocar: sesion.esDuenio, duenio } : null}
      />

      <AppsDelNegocioCard
        tenantId={t.id}
        vistos={negocio!.modules}
        estado={estadoApps}
        fijar={fijar}
        modulos={filasModulos}
        previa={previa}
        bloqueo={conCandado ? MOTIVO_OK_DEL_DUENIO : null}
      />

      {/* La red: la única puerta para que un negocio lea datos de otro (auditada en los dos). */}
      <RedDeLocalesCard
        tenantId={t.id}
        nombre={t.name}
        esCasa={esCasa}
        tieneCartera={activos.has("cartera")}
        bloqueo={conCandado ? MOTIVO_OK_DEL_DUENIO_RED : null}
        red={red}
        candidatos={candidatosRed}
      />
    </>
  );

  const acentoActual = (t.accentPreset ?? "") as AccentPreset | "";
  const marcaPanel = (
    <Bloque
      titulo="Marca y vidriera"
      nota="El color de su panel y de su vidriera, y el tema de la vidriera"
    >
      <form action={setTenantBranding} className="space-y-5 py-3">
        <input type="hidden" name="tenantId" value={t.id} />
        <fieldset>
          <legend className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.06em] text-muted">
            Color
          </legend>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded border border-line-strong bg-surface-raised px-3 text-sm has-[:checked]:border-accent has-[:checked]:font-semibold">
              <input
                type="radio"
                name="accentPreset"
                value=""
                defaultChecked={acentoActual === ""}
              />
              El del rubro
            </label>
            {(Object.keys(ACCENT_PRESETS) as AccentPreset[]).map((a) => (
              <label
                key={a}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded border border-line-strong bg-surface-raised px-3 text-sm has-[:checked]:border-accent has-[:checked]:font-semibold"
              >
                <input
                  type="radio"
                  name="accentPreset"
                  value={a}
                  defaultChecked={acentoActual === a}
                />
                <span
                  aria-hidden
                  className="inline-block size-4 rounded-sm border border-line"
                  style={{ background: ACCENT_PRESETS[a].light }}
                />
                {ACCENT_PRESET_LABELS[a]}
              </label>
            ))}
          </div>
        </fieldset>
        <Field
          label="Tema de la vidriera"
          htmlFor="ficha-tema"
          className="max-w-xs"
        >
          <Select
            id="ficha-tema"
            name="frontTheme"
            defaultValue={t.frontTheme ?? ""}
          >
            <option value="">El del rubro</option>
            <option value="light">Claro</option>
            <option value="dark">Oscuro</option>
          </Select>
        </Field>
        <Button type="submit" variant="outline">
          Guardar la marca
        </Button>
      </form>
    </Bloque>
  );

  const personasPanel = (
    <Bloque
      id="personas"
      titulo="La contraseña del dueño"
      cuenta={`${usuariosActivos} ${usuariosActivos === 1 ? "persona entra" : "personas entran"} a su panel`}
    >
      <ResetOwnerPasswordCard
        tenantId={t.id}
        slug={t.slug}
        ownerEmail={owner?.email ?? null}
        tempPending={ownerTempPending}
        soloLectura={soloLectura}
      />
      <p className="py-2 text-[13px] text-muted">
        El resto de las personas las da de alta el dueño desde su panel
        (Configuración › Usuarios y permisos).
      </p>
    </Bloque>
  );

  // El historial: lo que GSG cambió en este negocio (interruptores y módulos), lo más nuevo arriba.
  const hechos = [
    ...(interruptores?.historial ?? []).map((h) => ({
      id: `i-${h.id}`,
      cuando: h.cuando,
      quien: h.quien,
      frase: `${h.encendio ? "Prendió" : "Apagó"} «${interruptorPorId(h.interruptor).nombre}»`,
      detalle: null as string | null,
    })),
    ...historial.map((h) => {
      const f = frasesDeCambioDeModulo(h, filasModulos);
      return {
        id: `m-${h.id}`,
        cuando: h.cuando,
        quien: h.actor,
        frase: f.frase,
        detalle: f.antesYDespues as string | null,
      };
    }),
  ].sort((a, b) => b.cuando.getTime() - a.cuando.getTime());
  const historialPanel = (
    <Bloque
      titulo="Lo que GSG cambió acá"
      cuenta={hechos.length || undefined}
      nota="Interruptores y módulos · lo más nuevo arriba"
    >
      {hechos.length === 0 ? (
        <p className="py-3 text-sm text-muted">
          Todavía no se prendió ni se apagó nada, ni se cambiaron módulos desde
          la consola.
        </p>
      ) : (
        hechos.map((h) => (
          <Renglon
            key={h.id}
            folio={fecha(h.cuando)}
            titulo={h.frase}
            detalle={`${h.quien}${h.detalle ? ` · ${h.detalle}` : ""}`}
          />
        ))
      )}
      <p className="py-2 text-[13px] text-muted">
        En la Auditoría del negocio figura como{" "}
        {INTERRUPTORES.map((i) => `«GSG activó ${i.enAuditoria}»`).join(" o ")},
        sin el nombre del operador; los cambios de módulos, con el antes y el
        después.
      </p>
    </Bloque>
  );

  const pestanas: PestanaDeFicha[] = [
    { id: "puesta", etiqueta: "Puesta en marcha", conteo: apertura.pendientes },
    { id: "fiscal", etiqueta: "Fiscal", conteo: pendientesFiscal },
    { id: "plan", etiqueta: "Plan y apps" },
    { id: "marca", etiqueta: "Marca y vidriera" },
    { id: "personas", etiqueta: "Personas" },
    { id: "historial", etiqueta: "Historial" },
  ];
  const inicial = modulo ? "plan" : leerPestana(pestana);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/operador"
          className="inline-flex min-h-11 items-center text-sm text-muted hover:text-strong lg:min-h-0"
        >
          ← Negocios
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-2xl font-bold text-strong">{t.name}</h1>
              <Marca tipo={estado.marca}>{estado.texto}</Marca>
              {conCandado && <Marca tipo="atencion">Con candado</Marca>}
            </div>
            <LineaDeEstado
              datos={[
                t.subdomain ?? t.slug,
                rubro,
                plan.nota ? `${plan.texto} (${plan.nota})` : plan.texto,
                `${t._count.users} ${t._count.users === 1 ? "persona" : "personas"}`,
                `${t._count.clients.toLocaleString("es-AR")} clientes`,
                `alta el ${dia(t.createdAt)}`,
              ]}
            />
          </div>
          {suPanel && (
            <a
              href={suPanel}
              target="_blank"
              rel="noopener noreferrer"
              {...atributosBoton("outline", "md")}
              className="inline-flex items-center"
            >
              Abrir su panel
              <span className="sr-only">
                {" "}
                (se abre en otra pestaña; pide un usuario de ese negocio)
              </span>
            </a>
          )}
        </div>
      </header>

      {/* La contraseña del alta NO viaja por la URL (seguridad-hallazgos.test.ts, C-2): la muestra
          el alta una sola vez, en su pantalla. Acá sólo el aviso. */}
      {created && (
        <Franja>
          Negocio dado de alta. Seguí la puesta en marcha para dejarlo listo
          para abrir.
        </Franja>
      )}
      {ok && <Franja>{OK_CORTOS.get(ok) ?? ok}</Franja>}
      {error && (
        <Franja tono="peligro" className="whitespace-pre-wrap break-words">
          {error}
        </Franja>
      )}
      {soloLectura && (
        <Franja tono="atencion">
          <b>Sólo lectura.</b> {soloLectura}
        </Franja>
      )}

      {/* CH con un operador que no es el dueño: la ficha se ve, pero nada se puede cambiar. Es la misma
          regla que aplica cada action en el servidor (requireOperadorParaNegocio). */}
      <fieldset disabled={!!soloLectura} className="contents">
        <FichaConPestanas
          negocioId={t.id}
          inicial={inicial}
          pedidaEnLaUrl={!!pestana || !!modulo}
          pestanas={pestanas}
          paneles={{
            puesta,
            fiscal: fiscalPanel,
            plan: planPanel,
            marca: marcaPanel,
            personas: personasPanel,
            historial: historialPanel,
          }}
        />
      </fieldset>
    </div>
  );
}
