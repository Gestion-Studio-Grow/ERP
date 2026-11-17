// CRM COMERCIAL · piezas compartidas de las pantallas (GSG-CRM-011).
//
// Guardia de TODAS las páginas: `requireApp("crm-comercial")` al tope (sesión y panel del negocio) y después
// `abrirCrm(user)`: el interruptor «crm-comercial» del negocio (apagado → 404: para ese negocio no existe) y el
// tenantId del request. Quién puede qué NO sale del rol del ERP sino de la membresía del CRM (E16): sin
// membresía la página lo dice y ofrece cómo seguir; los botones que no le tocan no aparecen, y el servidor
// igual rechaza (cada acción de src/lib/crm-comercial/acciones.ts vuelve a comprobar todo).

import "server-only";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { SessionUser } from "@/lib/session";
import { getCurrentTenantId } from "@/lib/tenant";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { crmComercialPrendido } from "@/cambios/interruptores";
import { AvisoError, PageHeader, Pestanas } from "@/components/ui";
import { miMembresia } from "@/lib/crm-comercial/acciones";
import type { Miembro } from "@/lib/crm-comercial/permisos";
import { puedeEn, quienEs } from "./crm-core";
import { DarmeDeAlta } from "./DarmeDeAlta";

export const TITULO = "CRM comercial";
export type Vista = "hoy" | "embudo" | "borradores" | "nueva" | "ficha" | "miembros";

/** Apagado → 404. Prendido → la membresía del CRM de quien entra (o por qué no puede entrar). */
export async function abrirCrm(user: SessionUser): Promise<{ user: SessionUser; tenantId: string; miembro: Miembro | null; bloqueo: React.ReactNode | null }> {
  if (!crmComercialPrendido(await interruptoresDelNegocio())) notFound();
  const tenantId = await getCurrentTenantId();
  if (user.tenantId !== tenantId) notFound();
  const r = await miMembresia();
  if (!r.ok) {
    return { user, tenantId, miembro: null, bloqueo: r.faltaMigracion ? <FaltaMigracion /> : <AvisoError titulo="No se pudo abrir el CRM" comoSeguir={r.motivo} /> };
  }
  const m = r.miembro;
  if (!m || !m.activo) {
    const arranque = !r.hayDireccion && user.role === "OWNER";
    return {
      user,
      tenantId,
      miembro: null,
      bloqueo: (
        <AvisoError
          tono="aviso"
          titulo={m ? "Tu usuario está dado de baja en el CRM comercial" : "Todavía no estás dado de alta en el CRM comercial"}
          comoSeguir={arranque ? "Nadie está todavía en Dirección. Como dueña o dueño del negocio podés darte de alta vos y después sumar al resto." : "Pedíselo a Dirección: te da de alta con tu papel (Dirección, comercial o un puesto del equipo)."}
          accion={arranque ? <DarmeDeAlta userId={user.id} /> : <Link href="/admin" className="text-accent underline underline-offset-2">Volver al inicio</Link>}
        />
      ),
    };
  }
  return { user, tenantId, miembro: m, bloqueo: null };
}

export function Encabezado({ vista, miembro, descripcion }: { vista: Vista; miembro: Miembro | null; descripcion?: string }) {
  const pestanas = [
    { href: "/admin/crm", etiqueta: "Hoy", actual: vista === "hoy" },
    { href: "/admin/crm/embudo", etiqueta: "Embudo", actual: vista === "embudo" },
    { href: "/admin/crm/borradores", etiqueta: "Borradores", actual: vista === "borradores" },
    ...(puedeEn(miembro, "proponer_oportunidad") ? [{ href: "/admin/crm/nueva", etiqueta: "Cargar", actual: vista === "nueva" }] : []),
    // Sólo Dirección (operación «configurar»); el servidor igual rechaza a cualquier otro.
    ...(puedeEn(miembro, "configurar") ? [{ href: "/admin/crm/miembros", etiqueta: "Miembros", actual: vista === "miembros" }] : []),
  ];
  return (
    <>
      <PageHeader title={TITULO} description={descripcion} />
      {miembro && <p className="-mt-2 mb-3 text-sm text-muted">Entraste como {quienEs(miembro)}.</p>}
      {/* A 390 px las cinco pestañas entran sin cortarse: menos aire a los costados en el celular. */}
      <Pestanas pestanas={pestanas} etiqueta="Vistas del CRM comercial" conRaya className="mb-6 [&>a]:px-2 sm:[&>a]:px-3" />
    </>
  );
}

export function Marco({ vista, miembro, descripcion, children, ancho = "max-w-6xl" }: { vista: Vista; miembro: Miembro | null; descripcion?: string; children: React.ReactNode; ancho?: string }) {
  return (
    <main className={`mx-auto w-full min-w-0 ${ancho} px-4 py-6 sm:px-6 sm:py-8`}>
      <Encabezado vista={vista} miembro={miembro} descripcion={descripcion} />
      {children}
      {/* Sello GSG (Gate de Excelencia 2): el negocio conserva su marca; GSG firma discreto, como Facturación. */}
      <footer className="mt-2xl border-t border-line pt-4 text-center text-xs text-faint">Con tecnología de Gestión Studio Grow</footer>
    </main>
  );
}

export function FaltaMigracion() {
  return (
    <AvisoError
      tono="aviso"
      titulo="Falta un paso de base de datos"
      comoSeguir="El CRM comercial está activado pero sus tablas todavía no están creadas en este negocio. Avisale a GSG: es un paso de una sola vez."
    />
  );
}

/** Un rechazo de una lectura: el motivo del servidor, tal cual, con la salida. */
export function NoSePudo({ motivo, faltaMigracion }: { motivo: string; faltaMigracion?: true }) {
  if (faltaMigracion) return <FaltaMigracion />;
  return <AvisoError titulo="No se pudo mostrar" comoSeguir={motivo} accion={<Link href="/admin/crm" className="text-accent underline underline-offset-2">Volver a Hoy</Link>} />;
}
