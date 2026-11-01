import Link from "next/link";
import { buttonClasses, cn } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { RLS_ENFORCEMENT } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { cambiarEstadoPersona, guardarPermisos } from "@/lib/proyectos/acciones-gestion";
import { COLUMNAS_FICHA, COLUMNAS_OCULTAS_BASE, MODULOS, permisoDe, ROL_LABEL, ROLES_GESTION, type RolGestion } from "@/lib/proyectos/gestion-core";
import { exigirVer, puede, type Actor } from "@/lib/proyectos/gestion.server";
import { personasDelEquipo, registroDeCambios } from "@/lib/proyectos/gestion-lecturas.server";
import { plataEn } from "@/lib/proyectos/gestion-core";
import { tarjeta } from "../_vista";
import { FormPersona } from "./FormPersona";

export const dynamic = "force-dynamic";
export const metadata = { title: "Equipo y permisos" };

const PESTANAS = [
  { id: "personas", label: "Personas" },
  { id: "permisos", label: "Permisos" },
  { id: "registro", label: "Registro de cambios" },
  { id: "seguridad", label: "Seguridad" },
] as const;

const fechaHora = (d: Date) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" }).format(d);
const casilla = "flex min-h-11 min-w-11 items-center justify-center";
const ROLES = ROLES_GESTION.filter((r): r is Exclude<RolGestion, "DIRECCION" | "SIN_FICHA"> => r !== "DIRECCION");

async function Personas({ a }: { a: Actor }) {
  const personas = await personasDelEquipo(a);
  const edita = puede(a, "equipo", "editar");
  const sueldo = puede(a, "liquidaciones", "editar") ? "editar" : puede(a, "liquidaciones", "ver") ? "ver" : "oculto";
  const noEsDireccion = a.rol !== "DIRECCION";
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">
        Acá se carga quién trabaja en los eventos. Esta pantalla no crea cuentas de ingreso: <Link href="/admin/usuarios" className="underline">se dan de alta en Usuarios</Link>, y después se vinculan por mail.
      </p>
      {edita && (
        <details className={tarjeta}>
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-strong">Nueva persona</summary>
          <div className="mt-3"><FormPersona sueldo={sueldo} soloDireccionDa={noEsDireccion} /></div>
        </details>
      )}
      {personas.length === 0 ? (
        <p className={cn(tarjeta, "text-sm text-muted")}>Todavía no hay personas cargadas.</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {personas.map((p) => {
            const tocable = edita && (p.rol !== "DIRECCION" || !noEsDireccion);
            return (
              <li key={p.id} className={cn(tarjeta, "grid min-w-0 content-start gap-1", !p.activa && "opacity-70")}>
                <p className="break-words font-semibold text-strong">{p.nombre}{!p.activa && " (de baja)"}</p>
                <p className="break-words text-sm text-muted">{[ROL_LABEL[p.rol as RolGestion] ?? p.rol, p.puesto].filter(Boolean).join(" · ")}</p>
                <p className="break-words text-sm text-muted">{p.email ?? "Sin mail"} · {p.userId ? "Con cuenta" : "Sin cuenta de ingreso"}</p>
                {p.sueldoBase !== null && <p className="text-sm text-strong">Sueldo {plataEn(p.sueldoBase, "ARS")}</p>}
                {p.facturaA && <p className="break-words text-sm text-muted">Factura a {p.facturaA}</p>}
                {tocable && (
                  <details className="mt-1">
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-strong underline">Editar</summary>
                    <div className="mt-2 grid gap-3">
                      <FormPersona valores={p} sueldo={sueldo} soloDireccionDa={noEsDireccion} />
                      {p.userId !== a.user.id && (
                        <form action={cambiarEstadoPersona}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="activa" value={p.activa ? "0" : "1"} />
                          <button type="submit" className={buttonClasses("ghost", "md")}>{p.activa ? "Dar de baja" : "Reactivar"}</button>
                        </form>
                      )}
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Permisos({ a, ok }: { a: Actor; ok: boolean }) {
  const edita = puede(a, "equipo", "editar");
  // Nadie se sube a sí mismo los permisos, salvo Dirección, que ya tiene todos.
  const bloqueado = (rol: string) => !edita || (a.rol !== "DIRECCION" && a.rol === rol);
  const ocultas = (rol: Exclude<RolGestion, "DIRECCION">) => {
    const g = a.permisos.find((p) => p.rol === rol && p.modulo === "ficha")?.columnasOcultas;
    return Array.isArray(g) ? (g as string[]) : [...COLUMNAS_OCULTAS_BASE[rol]];
  };
  return (
    <form action={guardarPermisos} className="grid gap-4">
      <p className="text-sm text-muted">Dirección es fija: ve y edita todo. Editar incluye ver. Dirección y Administración ven todos los proyectos; el resto, sólo aquellos donde está en el equipo.</p>
      {ok && <p role="status" className="text-sm font-medium text-strong">Permisos guardados.</p>}
      <section className={cn(tarjeta, "overflow-x-auto")} aria-label="Permisos por rol y módulo">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 pr-2 text-left font-medium">Módulo</th>
              {ROLES.map((r) => <th key={r} colSpan={2} className="px-1 text-center font-semibold text-strong">{ROL_LABEL[r]}</th>)}
            </tr>
            <tr>
              <th aria-hidden />
              {ROLES.flatMap((r) => [<th key={`${r}-v`} className="font-medium">Ver</th>, <th key={`${r}-e`} className="font-medium">Editar</th>])}
            </tr>
          </thead>
          <tbody>
            {MODULOS.map((m) => (
              <tr key={m.id} className="border-t border-line">
                <th scope="row" className="py-1 pr-2 text-left font-normal text-strong">{m.label}</th>
                {ROLES.flatMap((r) => {
                  const p = permisoDe(r, m.id, a.permisos);
                  return [
                    <td key={`${r}-v`} className="text-center"><label className={casilla}><input type="checkbox" name={`ver:${r}:${m.id}`} defaultChecked={p.ver} disabled={bloqueado(r)} aria-label={`${ROL_LABEL[r]} ve ${m.label}`} className="h-5 w-5" /></label></td>,
                    <td key={`${r}-e`} className="text-center"><label className={casilla}><input type="checkbox" name={`editar:${r}:${m.id}`} defaultChecked={p.editar} disabled={bloqueado(r)} aria-label={`${ROL_LABEL[r]} edita ${m.label}`} className="h-5 w-5" /></label></td>,
                  ];
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className={cn(tarjeta, "overflow-x-auto")} aria-label="Columnas ocultas en la ficha">
        <h2 className="mb-1 font-semibold text-strong">Columnas ocultas en la ficha</h2>
        <p className="mb-2 text-sm text-muted">Marcá lo que ese rol no tiene que ver.</p>
        <table className="w-full min-w-[420px] text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 pr-2 text-left font-medium">Columna</th>
              {ROLES.map((r) => <th key={r} className="px-1 text-center font-semibold text-strong">{ROL_LABEL[r]}</th>)}
            </tr>
          </thead>
          <tbody>
            {COLUMNAS_FICHA.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <th scope="row" className="py-1 pr-2 text-left font-normal text-strong">{c.label}</th>
                {ROLES.map((r) => (
                  <td key={r} className="text-center"><label className={casilla}><input type="checkbox" name={`oculta:${r}:${c.id}`} defaultChecked={ocultas(r).includes(c.id)} disabled={bloqueado(r)} aria-label={`Ocultar ${c.label} a ${ROL_LABEL[r]}`} className="h-5 w-5" /></label></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {edita && <div><SubmitButton className={buttonClasses("solid", "md")} variant="solid" size="md">Guardar permisos</SubmitButton></div>}
    </form>
  );
}

async function Registro({ a, pagina: pedida }: { a: Actor; pagina?: string }) {
  const { filas, pagina, paginas, total } = await registroDeCambios(a, pedida);
  const ruta = (n: number) => `/admin/proyectos/equipo?tab=registro&pagina=${n}`;
  return (
    <section className={tarjeta} aria-label="Registro de cambios">
      <p className="mb-2 text-sm text-muted">{total === 1 ? "1 cambio registrado" : `${total} cambios registrados`}</p>
      {filas.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay cambios registrados.</p>
      ) : (
        <ul className="grid">
          {filas.map((f) => (
            <li key={f.id} className="grid gap-1 border-t border-line py-2 text-sm lg:grid-cols-[11rem_9rem_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-3">
              <span className="text-xs text-muted">{fechaHora(f.createdAt)}</span>
              <span className="min-w-0 break-words text-strong">{f.autor}</span>
              <span className="min-w-0 break-words text-strong">{f.entidad} · {f.campo}</span>
              <span className="min-w-0 break-words text-muted"><span className="lg:hidden">Antes: </span>{f.antes ?? "—"}</span>
              <span className="min-w-0 break-words text-strong"><span className="text-muted lg:hidden">Después: </span>{f.despues ?? "—"}</span>
            </li>
          ))}
        </ul>
      )}
      {paginas > 1 && (
        <nav aria-label="Páginas" className="mt-3 flex flex-wrap items-center gap-2">
          {pagina > 1 && <Link href={ruta(pagina - 1)} className={buttonClasses("outline", "md")}>Anterior</Link>}
          <span className="text-sm text-muted">Página {pagina} de {paginas}</span>
          {pagina < paginas && <Link href={ruta(pagina + 1)} className={buttonClasses("outline", "md")}>Siguiente</Link>}
        </nav>
      )}
    </section>
  );
}

function Seguridad() {
  const protege = [
    "Contraseñas guardadas con hash (scrypt): nadie puede leerlas, tampoco desde la base.",
    "Sesión en una cookie firmada, inaccesible desde el navegador, que vence a las 8 horas.",
    "Bloqueo tras 5 ingresos fallidos en 15 minutos.",
    "Cada pantalla y cada acción de estas apps comprueba el permiso del rol en el servidor, no sólo esconde el botón.",
    "Todas las lecturas y escrituras están acotadas a este negocio.",
    RLS_ENFORCEMENT ? "Además, la base de datos filtra por negocio (seguridad por fila) en este servidor." : "La seguridad por fila de la base de datos está apagada en este servidor: el filtro por negocio lo hace la aplicación.",
    "Los costos, los márgenes y los proveedores no salen en los links de cliente: esos datos no se envían al navegador.",
    "Los cambios de precios, pagos, permisos y personas quedan en el registro: quién, qué, antes y después.",
  ];
  const noHay = [
    "Verificación en dos pasos (2FA): no está construida para el ingreso al ERP.",
    "Ingreso con Google: no está construido.",
    "Envío por mail de estos avisos: sale sólo si el servidor tiene RESEND_API_KEY y RESEND_FROM_EMAIL.",
    "Los links de cliente y de calendario no vencen: quien tenga el link entra. La dirección de calendario de una persona deja de funcionar cuando se da de baja su cuenta en Usuarios; no se puede renovar por separado.",
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={tarjeta} aria-label="Qué protege hoy">
        <h2 className="mb-2 font-semibold text-strong">Qué protege hoy el sistema</h2>
        <ul className="grid list-disc gap-1.5 pl-5 text-sm text-strong">{protege.map((t) => <li key={t}>{t}</li>)}</ul>
      </section>
      <section className={tarjeta} aria-label="Qué no hay todavía">
        <h2 className="mb-2 font-semibold text-strong">Qué no hay todavía</h2>
        <ul className="grid list-disc gap-1.5 pl-5 text-sm text-strong">{noHay.map((t) => <li key={t}>{t}</li>)}</ul>
      </section>
    </div>
  );
}

export default async function EquipoGestion({ searchParams }: { searchParams: Promise<{ tab?: string; pagina?: string; ok?: string }> }) {
  await requireApp("gestion-equipo");
  const a = await exigirVer("equipo");
  const sp = await searchParams;
  const tab = PESTANAS.find((p) => p.id === sp.tab)?.id ?? "personas";
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-5">
      <h1 className="text-2xl font-bold text-strong">Equipo y permisos</h1>
      <nav aria-label="Secciones" className="-mx-4 flex gap-1 overflow-x-auto px-4">
        {PESTANAS.map((p) => (
          <Link key={p.id} href={`/admin/proyectos/equipo?tab=${p.id}`} aria-current={tab === p.id ? "page" : undefined} className={cn("flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-medium", tab === p.id ? "bg-accent text-on-accent" : "text-strong hover:bg-surface-raised")}>
            {p.label}
          </Link>
        ))}
      </nav>
      {tab === "personas" && <Personas a={a} />}
      {tab === "permisos" && <Permisos a={a} ok={sp.ok === "1"} />}
      {tab === "registro" && <Registro a={a} pagina={sp.pagina} />}
      {tab === "seguridad" && <Seguridad />}
    </main>
  );
}
