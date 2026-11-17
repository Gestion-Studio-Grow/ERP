import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { canCurrentUser } from "@/lib/authz";
import { AvisoError, Badge, EmptyState } from "@/components/ui";
import { usuariosYMiembros } from "@/lib/crm-comercial/acciones";
import { abrirCrm, Marco, NoSePudo } from "../comun";
import { opcionesDePuesto, ordenarUsuarios, papelEnCrm, puedeEn } from "../crm-core";
import { FormularioMiembro } from "./FormularioMiembro";

export const dynamic = "force-dynamic";

// CRM COMERCIAL · «Miembros del CRM» (diseño §3): los usuarios del negocio con su papel en el CRM (Dirección,
// Comercial, un puesto del equipo o sin acceso). Sólo Dirección la ve y la opera; quién puede lo decide el
// servidor (operación «configurar» en repo.usuariosYMiembros y repo.guardarMiembro). El USUARIO del ERP no se
// crea acá: va por el alta de usuarios del panel (/admin/usuarios).

export default async function MiembrosPage() {
  const { miembro, bloqueo } = await abrirCrm(await requireApp("crm-comercial"));
  const descripcion = "Quién entra al CRM y con qué papel. Un usuario sin acceso no ve nada del CRM.";
  if (!miembro) return <Marco vista="miembros" miembro={null} descripcion={descripcion}>{bloqueo}</Marco>;
  if (!puedeEn(miembro, "configurar")) {
    return (
      <Marco vista="miembros" miembro={miembro} descripcion={descripcion}>
        <AvisoError tono="aviso" titulo="Esta pantalla es de Dirección" comoSeguir="Los papeles del CRM los asigna Dirección. Si necesitás un cambio, pedíselo." accion={<Link href="/admin/crm" className="text-accent underline underline-offset-2">Volver a Hoy</Link>} />
      </Marco>
    );
  }
  const [r, creaUsuarios] = await Promise.all([usuariosYMiembros(), canCurrentUser("users:manage")]);
  if (!r.ok) return <Marco vista="miembros" miembro={miembro} descripcion={descripcion}><NoSePudo motivo={r.motivo} faltaMigracion={r.faltaMigracion} /></Marco>;
  const usuarios = ordenarUsuarios(r.usuarios);
  const puestos = opcionesDePuesto();

  const altaDeUsuarios = creaUsuarios ? (
    <>¿Falta alguien? Primero se crea su usuario en <Link href="/admin/usuarios" className="text-accent underline underline-offset-2">Usuarios del panel</Link> (con contraseña provisoria) y después le das su papel acá.</>
  ) : (
    <>¿Falta alguien? Su usuario lo crea quien administra los usuarios del panel; después le das su papel acá.</>
  );

  return (
    <Marco vista="miembros" miembro={miembro} descripcion={descripcion} ancho="max-w-4xl">
      <p className="mb-4 text-sm text-muted">{altaDeUsuarios} Para un puesto del equipo, usá un usuario propio por puesto.</p>
      {usuarios.length === 0 ? (
        <EmptyState title="Todavía no hay usuarios en el negocio" description="Crealos en Usuarios del panel y volvé para darles su papel." />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface" aria-label="Usuarios del negocio y su papel en el CRM">
          {usuarios.map((u) => (
            <li key={u.userId} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-6">
              <div className="min-w-0">
                <p className="break-words font-medium text-strong">
                  {u.nombre}
                  {u.userId === miembro.userId && <span className="text-sm font-normal text-muted"> (vos)</span>}
                </p>
                <p className="break-all text-sm text-muted">{u.email}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone={!u.miembro ? "neutral" : u.miembro.activo ? "success" : "warning"}>{papelEnCrm(u.miembro)}</Badge>
                  {!u.activoEnErp && <Badge tone="danger">Usuario del panel dado de baja</Badge>}
                </p>
                {u.miembro?.activo && u.miembro.rol === "PUESTO" && (
                  <p className="mt-1 text-sm text-muted">
                    Topes por día: {u.miembro.topeAccionesDia == null ? "sin tope de acciones" : `${u.miembro.topeAccionesDia} acciones`} · {u.miembro.topeCostoDiaUsd == null ? "sin tope de gasto" : `US$ ${u.miembro.topeCostoDiaUsd}`}
                  </p>
                )}
              </div>
              <FormularioMiembro userId={u.userId} nombre={u.nombre} actual={u.miembro} puestos={puestos} />
            </li>
          ))}
        </ul>
      )}
    </Marco>
  );
}
