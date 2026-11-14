import Link from "next/link";
import { buttonClasses, cn } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { requireApp } from "@/lib/require-app";
import { guardarPreferenciasAvisos } from "@/lib/proyectos/acciones-gestion";
import { veLaPlata } from "@/lib/proyectos/datos.server";
import { TIPOS_AVISO } from "@/lib/proyectos/gestion-core";
import { actorActual } from "@/lib/proyectos/gestion.server";
import { etapa2ActivaActual } from "@/lib/proyectos/etapa2.server";
import { mailConectado } from "@/lib/notifications";
import { direccionDelCalendario, misPreferenciasDeAviso } from "@/lib/proyectos/gestion-lecturas.server";
import { tarjeta } from "../_vista";
import { CopiarDireccion } from "../calendario/_cliente";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración" };

export default async function ConfiguracionGestion({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  await requireApp("proyectos");
  const a = await actorActual();
  const [{ ok }, prefs, direccion, importador] = await Promise.all([searchParams, misPreferenciasDeAviso(a), direccionDelCalendario(a), etapa2ActivaActual("importador")]);
  const apagados = new Set(prefs.filter((p) => !p.enSistema).map((p) => p.tipo));
  const porMail = new Set(prefs.filter((p) => p.porMail).map((p) => p.tipo));

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-5">
      <h1 className="text-2xl font-bold text-strong">Configuración</h1>

      <section className={tarjeta} aria-label="Avisos">
        <h2 className="mb-1 font-semibold text-strong">Mis avisos</h2>
        <p className="mb-3 text-sm text-muted">{mailConectado() ? "Elegí qué avisos querés recibir también en tu mail." : "Podés dejar elegidos los mails: empiezan a salir cuando se conecte el servicio de envío en el servidor."}</p>
        <form action={guardarPreferenciasAvisos} className="grid gap-3">
          {ok === "1" && <p role="status" className="text-sm font-medium text-strong">Avisos guardados.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 pr-2 text-left font-medium">Aviso</th>
                  <th className="px-1 font-medium">En el sistema</th>
                  <th className="px-1 font-medium">Por mail</th>
                </tr>
              </thead>
              <tbody>
                {TIPOS_AVISO.map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <th scope="row" className="py-1 pr-2 text-left font-normal text-strong">{t.label}</th>
                    <td className="text-center"><label className="flex min-h-11 min-w-11 items-center justify-center"><input type="checkbox" name={`sistema:${t.id}`} defaultChecked={!apagados.has(t.id)} aria-label={`${t.label}, en el sistema`} className="h-5 w-5" /></label></td>
                    <td className="text-center"><label className="flex min-h-11 min-w-11 items-center justify-center"><input type="checkbox" name={`mail:${t.id}`} defaultChecked={porMail.has(t.id)} aria-label={`${t.label}, por mail`} className="h-5 w-5" /></label></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div><SubmitButton className={buttonClasses("solid", "md")} variant="solid" size="md">Guardar avisos</SubmitButton></div>
        </form>
      </section>

      <section className={tarjeta} aria-label="Calendario">
        <h2 className="mb-1 font-semibold text-strong">Calendario</h2>
        <p className="mb-3 text-sm text-muted">Tu dirección de suscripción, para Google Calendar o el teléfono. Es personal y nunca trae montos.</p>
        {direccion ? <CopiarDireccion direccion={direccion} /> : <p className="text-sm text-danger">No se pudo armar la dirección en este servidor.</p>}
      </section>

      {importador && a.rol === "DIRECCION" && (
        <section className={tarjeta} aria-label="Importar planilla">
          <h2 className="mb-1 font-semibold text-strong">Importar planilla de proyectos</h2>
          <p className="mb-3 text-sm text-muted">Cargá de una vez los proyectos de la planilla de estado (clientes, etapas, fechas y comentarios). Primero ves qué se carga y nada se repite.</p>
          <Link href="/admin/proyectos/importar" className={buttonClasses("outline", "md")}>Importar planilla</Link>
        </section>
      )}

      <section className={tarjeta} aria-label="Seguridad">
        <h2 className="mb-3 font-semibold text-strong">Seguridad</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/cambiar-password" className={buttonClasses("outline", "md")}>Cambiar mi contraseña</Link>
          {veLaPlata(a.user) && <Link href="/admin/proyectos/config" className={cn(buttonClasses("ghost", "md"))}>Márgenes y condiciones de las propuestas</Link>}
        </div>
      </section>
    </main>
  );
}
