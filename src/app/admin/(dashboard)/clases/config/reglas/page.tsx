import { requireApp } from "@/lib/require-app";
import { cn } from "@/components/ui";
import { badgePendientes, configCompleta } from "@/lib/padel/datos.server";
import { tarjeta } from "../../_vista";
import { EncabezadoAjuste } from "../_encabezado";
import { ChipsAuto } from "../_campo";
import { ANTICIPACION, DIAS_VISIBLES, PEDIDOS_SIN_RESPONDER, rotuloMinutos } from "./opciones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Reglas", manifest: "/clases/app.webmanifest" };

const conActual = (ops: readonly { valor: number; rotulo: string }[], actual: number, rotulo: (n: number) => string) =>
  ops.some((o) => o.valor === actual) ? [...ops] : [...ops, { valor: actual, rotulo: rotulo(actual) }].sort((a, b) => a.valor - b.valor);

// Ajustes → Reglas (M-081): todo en chips, se guarda con el toque. La anticipación decide la
// primera hora que ofrece el turnero (con «2 h», a las 15:00 la primera es 17:00).
// Provisional: «No vino / cancelación tardía: se cobra o no», «Confirmar solo a los conocidos» y el
// cierre automático necesitan columnas nuevas (Tanda 4, migración sin aplicar). Hasta entonces se
// explica cómo funciona hoy, sin un interruptor que no haga nada.
export default async function AjustesReglas() {
  await requireApp("padel-clases");
  const [{ config }, numero] = await Promise.all([configCompleta(), badgePendientes()]);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <EncabezadoAjuste titulo="Reglas" detalle="Cómo te piden clase. Se guarda con el toque." pendientes={numero} />
      <section className={cn(tarjeta, "mb-4 grid gap-5")} aria-label="Reglas del turnero">
        <ChipsAuto
          clave="anticipacionMin"
          leyenda="Con cuánta anticipación te pueden pedir"
          ayuda="Con «2 h», si alguien entra a las 15:00, la primera hora que ve es a las 17:00."
          opciones={conActual(ANTICIPACION, config.anticipacionMin, rotuloMinutos)}
          inicial={config.anticipacionMin}
          qa="anticipacion"
        />
        <ChipsAuto
          clave="diasAdelante"
          leyenda="Cuántos días para adelante muestra el turnero"
          opciones={conActual(DIAS_VISIBLES, config.diasAdelante, (n) => `${n} días`)}
          inicial={config.diasAdelante}
          qa="dias"
        />
        <ChipsAuto
          clave="maxPendientesPorTel"
          leyenda="Cuántas clases puede pedir alguien sin que respondas"
          ayuda="Frena al que aprieta veinte veces. Cuando confirmás, puede pedir más."
          opciones={conActual(PEDIDOS_SIN_RESPONDER, config.maxPendientesPorTel, String)}
          inicial={config.maxPendientesPorTel}
          qa="pedidos"
        />
      </section>
      <section className={cn(tarjeta, "grid gap-2")} aria-labelledby="t-hoy">
        <h2 id="t-hoy" className="text-base font-semibold text-strong">Cómo funciona hoy lo demás</h2>
        <ul className="grid list-disc gap-1.5 pl-5 text-sm text-body">
          <li>Si alguien no vino, al marcar «No vino» elegís si se cobra igual o no.</li>
          <li>Si un alumno cancela tarde, te llega el aviso y decidís vos.</li>
          <li>Los alumnos que ya tomaron clase con vos y repiten la de la semana que viene quedan confirmados solos.</li>
          <li>Las clases que pasaron las cerrás vos desde Hoy («Ayer quedaron sin cerrar»).</li>
        </ul>
      </section>
    </main>
  );
}
