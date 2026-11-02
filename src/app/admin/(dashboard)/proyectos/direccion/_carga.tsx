import { cn } from "@/components/ui";
import { NIVEL_LABEL, ROL_LABEL, type RolGestion } from "@/lib/proyectos/gestion-core";
import { respuestaDeCarga } from "@/lib/proyectos/empresa-core";
import { cargaDelEquipo } from "@/lib/proyectos/empresa.server";
import { tarjeta } from "../_vista";

export async function TabCarga({ tenantId }: { tenantId: string }) {
  const filas = await cargaDelEquipo(tenantId);
  const r = respuestaDeCarga(filas);
  return (
    <div className="grid gap-4">
      <section className={tarjeta}>
        <h2 className="text-sm text-muted">¿Se puede tomar un evento más?</h2>
        <p className={cn("text-lg font-semibold", r.respuesta === "NO" ? "text-danger" : "text-strong")}>{r.texto}</p>
      </section>
      {filas.length > 0 && (
        <section className={cn(tarjeta, "overflow-x-auto")}>
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Persona</th>
                <th className="pr-3 font-medium">Rol</th>
                <th className="pr-3 text-right font-medium">Proyectos activos</th>
                <th className="pr-3 text-right font-medium">Tareas abiertas</th>
                <th className="pr-3 text-right font-medium">Esta semana</th>
                <th className="pr-3 text-right font-medium">Vencidas</th>
                <th className="font-medium">Nivel</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.personaId} className="border-t border-line tabular-nums">
                  <td className="py-1.5 pr-3"><span className="text-strong">{f.nombre}</span>{f.puesto && <span className="block text-xs text-muted">{f.puesto}</span>}</td>
                  <td className="pr-3">{ROL_LABEL[f.rol as RolGestion] ?? f.rol}</td>
                  <td className="pr-3 text-right">{f.proyectos}</td>
                  <td className="pr-3 text-right">{f.tareas}</td>
                  <td className="pr-3 text-right">{f.semana}</td>
                  <td className={cn("pr-3 text-right", f.vencidas > 0 && "font-medium text-danger")}>{f.vencidas}</td>
                  <td className={cn(f.nivel === "ALTA" ? "font-medium text-danger" : "text-strong")}>{NIVEL_LABEL[f.nivel]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
