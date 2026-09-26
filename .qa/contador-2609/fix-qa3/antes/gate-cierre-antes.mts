// Antes del arreglo: el gate del layout (HEAD) con los módulos reales de cada plan.
import { rutaDeAppConModulo } from "./rutas-HEAD";
import { rutaPermitidaParaModulos } from "@/lib/admin-nav-items";
import { PLAN_IDS, planPorId } from "@/planes/catalogo";
for (const plan of PLAN_IDS) {
  const m = planPorId(plan).modulos;
  const pasa = rutaPermitidaParaModulos("/admin/cierre-mes", m) || rutaDeAppConModulo("/admin/cierre-mes", m);
  console.log(`${plan}: /admin/cierre-mes pasa el gate = ${pasa}${pasa ? "" : "  -> redirect(/admin)"}`);
}
