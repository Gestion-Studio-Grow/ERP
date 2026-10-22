// «Mis clases» del alumno: la MISMA vista en /alumno/<token> (el link de WhatsApp) y en /mis-clases
// (el ícono instalado, con la cookie). Server Component: arma todo con los datos del servidor y sólo
// manda al teléfono las islas que tienen botones (Pagar, Cancelar, Cambiar horario, Contacto,
// Instalar). Nunca viaja al cliente el teléfono del alumno, ni nada de otro alumno o de otro negocio
// (alumnoPublico busca por tenantId + token). En /mis-clases el token NO se escribe en la página:
// las acciones lo toman de la cookie httpOnly (`token = null`).
//
// Orden (§2.4): la cuenta («Debés…», con Pagar) · tu próxima con sus acciones · las demás próximas ·
// las que ya no van (48 h, tachadas, con salida) · repetir · historial · contacto · instalar.

import type { DiaConLugar } from "@/lib/padel/datos.server";
import { agendaPublica, type alumnoPublico } from "@/lib/padel/datos.server";
import { getCurrentTenantId } from "@/lib/tenant";
import { marcaProfe } from "@/lib/padel/marca";
import { diaHumano, esDeuda, esEnRevision, esPagable, horaHumana, linkWhatsApp, pesos, proximaSemana } from "@/lib/padel/core";
import { Piel } from "@/app/clases/_piel";
import { CabeceraPublica } from "@/app/clases/_cabecera";
import { antetitulo, botonBorde, caja, tituloCaja } from "@/app/clases/_estilos";
import { chipEstado, enCuanto, etiquetaPago, explicacionTerminal, lineaDeCuenta, plazoCancelar, terminalVisible, urlMaps, type ClaseVista, type Tono } from "./estado";
import { Pagar, type ItemPago } from "./Pagar";
import { Cancelar, FueraDeTermino } from "./Cancelar";
import { CambiarHorario, Repetir } from "./CambiarHorario";
import { Contacto } from "./Contacto";
import { Instalar } from "./Instalar";

type Datos = NonNullable<Awaited<ReturnType<typeof alumnoPublico>>>;

const mayus = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const cuando = (d: Date) => mayus(`${diaHumano(d)} ${horaHumana(d)}`);

const TONO_CHIP: Record<Tono, string> = {
  espera: "border-[var(--padel-linea)] bg-[var(--padel-papel)] text-[var(--padel-texto)]",
  ok: "border-[var(--padel-cancha)] bg-[var(--padel-ok-suave)] text-[var(--padel-cancha)]",
  fin: "border-[var(--padel-peligro)] bg-[var(--padel-peligro-suave)] text-[var(--padel-peligro)]",
  neutro: "border-[var(--padel-linea)] bg-[var(--padel-superficie)] text-[var(--padel-suave)]",
};

function ChipEstado({ c, profe }: { c: ClaseVista; profe: string }) {
  const e = chipEstado(c.estado, profe);
  return (
    <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold ${TONO_CHIP[e.tono]}`} data-qa="estado">
      <span aria-hidden>{e.icono}</span>
      {e.texto}
    </span>
  );
}

const ACTIVAS = ["PEDIDA", "CONFIRMADA"];

export async function VistaAlumno({ datos, token }: { datos: Datos; token: string | null }) {
  const { alumno, config, negocio } = datos;
  const ahora = new Date();
  const m = marcaProfe(negocio.slug);
  const profe = negocio.profe;
  const nombre = alumno.client.name.split(" ")[0];
  const clases = alumno.clases as ClaseVista[];

  const vivas = clases.filter((c) => ACTIVAS.includes(c.estado) && c.terminaEn > ahora).sort((a, b) => +a.empiezaEn - +b.empiezaEn);
  const [proxima, ...otras] = vivas;
  const terminales = clases.filter((c) => terminalVisible(c, ahora)).sort((a, b) => +a.empiezaEn - +b.empiezaEn);
  const historial = clases.filter((c) => c.terminaEn <= ahora && (c.estado === "DADA" || c.estado === "AUSENTE")).slice(0, 10);

  // La cuenta: una sola regla (core.ts), la misma que ve el profe.
  const deudas = clases.filter(esDeuda);
  const itemsPago: ItemPago[] = clases
    .filter((c) => esPagable(c) || esEnRevision(c))
    .sort((a, b) => +a.empiezaEn - +b.empiezaEn)
    .map((c) => ({ id: c.id, cuando: cuando(c.empiezaEn), precio: c.precio, deuda: esDeuda(c), enRevision: esEnRevision(c), nota: c.pagoEstado === "PENDIENTE" ? (c.pagoNota ?? null) : null }));
  const cuenta = lineaDeCuenta({ debe: alumno.debe, clasesQueDebe: deudas.length, saldoAFavor: alumno.saldoAFavor });

  // Las horas libres sólo se leen si hay alguna clase que todavía se puede cambiar.
  const plazos = new Map(vivas.map((c) => [c.id, plazoCancelar(c, ahora, config.anticipacionMin)]));
  const algunaCambiable = [...plazos.values()].some((p) => p.puede);
  const agenda: DiaConLugar[] = algunaCambiable ? await agendaPublica(await getCurrentTenantId(), ahora) : [];

  // «La semana que viene igual»: sale de la última dada o confirmada, si todavía no la tiene.
  const base = clases.find((c) => c.estado === "DADA" || c.estado === "CONFIRMADA");
  const repetir = base ? proximaSemana(base.empiezaEn) : null;
  const yaTieneEsa = repetir ? clases.some((c) => +c.empiezaEn === +repetir && ACTIVAS.includes(c.estado)) : false;
  const ofrecerRepetir = Boolean(repetir && !yaTieneEsa && repetir > ahora);

  const wa = linkWhatsApp(negocio.whatsapp, `Hola ${profe}! Soy ${alumno.client.name}.`);
  const waAlias = linkWhatsApp(negocio.whatsapp, `Hola ${profe}! Soy ${alumno.client.name}. ¿Me pasás el alias para pagarte?`);
  const maps = urlMaps(negocio.lugar);
  const calendario = (id: string) => (token ? `/alumno/${token}/calendario/${id}` : `/mis-clases/calendario/${id}`);
  const nombreApp = profe && profe !== "profe" ? `Clases con ${profe}` : "Mis clases";

  const acciones = (c: ClaseVista) => {
    const p = plazos.get(c.id)!;
    return p.puede ? (
      <div className="flex flex-wrap items-center gap-2">
        <CambiarHorario token={token} claseId={c.id} estado={c.estado} dias={agenda} profe={profe} />
        <Cancelar token={token} claseId={c.id} cuando={`${diaHumano(c.empiezaEn)} ${horaHumana(c.empiezaEn)}`} plazo={p.texto} />
      </div>
    ) : (
      <FueraDeTermino token={token} claseId={c.id} explicacion={p.texto} profe={profe} />
    );
  };

  return (
    <Piel marca={m}>
      <CabeceraPublica antetitulo={negocio.nombre} titulo={`Hola ${nombre}`} />

      <main className="mx-auto grid max-w-[35rem] grid-cols-1 gap-4 px-4 pb-12 pt-4">
        <section aria-labelledby="cuenta" className={`${caja} border-t-[5px] ${cuenta.tono === "debe" ? "border-t-[var(--padel-peligro)]" : "border-t-[var(--padel-vivo)]"}`} data-qa="cuenta">
          <h2 id="cuenta" className={`text-xl font-bold tabular-nums ${cuenta.tono === "debe" ? "text-[var(--padel-peligro)]" : ""}`} data-qa={cuenta.tono === "debe" ? "debes" : cuenta.tono === "favor" ? "saldo-a-favor" : "al-dia"}>
            {cuenta.titulo}
          </h2>
          {alumno.saldoAFavor > 0 && (
            <p className="mt-1 text-base" data-qa={cuenta.tono === "favor" ? undefined : "saldo-a-favor"}>
              {cuenta.tono === "favor" ? "Tu próxima clase se paga con eso." : `Además tenés ${pesos(alumno.saldoAFavor)} a favor: tu próxima clase se paga con eso.`}
            </p>
          )}
          {alumno.enRevision > 0 && (
            <p className="mt-1 text-base text-[var(--padel-suave)]" data-qa="en-revision">
              <span className="tabular-nums">{pesos(alumno.enRevision)}</span> en revisión: {profe} tiene que validar tu comprobante.
            </p>
          )}
          {itemsPago.length > 0 && (
            <div className="mt-4 border-t border-[var(--padel-linea)] pt-4">
              <Pagar token={token} items={itemsPago} alias={config.aliasCbu} titular={config.titularCuenta} profe={profe} waAlias={waAlias} />
            </div>
          )}
        </section>

        <section aria-labelledby="tu-proxima" className={caja}>
          <h2 id="tu-proxima" className={antetitulo}>
            Tu próxima
          </h2>
          {proxima ? (
            <div className="mt-2 grid gap-3" data-qa="proxima-clase">
              <div>
                <p className="text-2xl font-bold tabular-nums" data-qa="proxima">
                  {cuando(proxima.empiezaEn)}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <ChipEstado c={proxima} profe={profe} />
                  <span className="text-base text-[var(--padel-suave)]" data-qa="en-cuanto">
                    {enCuanto(proxima.empiezaEn, ahora)}
                  </span>
                </div>
                {proxima.estado === "PEDIDA" && proxima.precio > 0 && (
                  <p className="mt-1 text-base text-[var(--padel-suave)]" data-qa="a-pagar-al-confirmar">
                    {pesos(proxima.precio)} · a pagar cuando {profe} confirme
                  </p>
                )}
                {proxima.pagoMedio === "SALDO_A_FAVOR" && proxima.pagoEstado === "PAGADO" && <p className="mt-1 text-base text-[var(--padel-suave)]">Ya está pagada con tu saldo a favor.</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {maps && (
                  <a href={maps} target="_blank" rel="noopener noreferrer" className={botonBorde} data-qa="como-llegar">
                    Cómo llegar
                  </a>
                )}
                <a href={calendario(proxima.id)} className={botonBorde} data-qa="al-calendario">
                  Al calendario
                </a>
              </div>
              {negocio.lugar && <p className="-mt-1 text-sm text-[var(--padel-suave)]">{negocio.lugar}</p>}
              {acciones(proxima)}
            </div>
          ) : (
            <div className="mt-2 grid gap-3">
              <p className="text-xl font-bold">No tenés clases agendadas</p>
              <a href="/clases" className={`${botonBorde} w-full`}>
                Ver horarios libres
              </a>
            </div>
          )}
        </section>

        {otras.length > 0 && (
          <section aria-labelledby="proximas" className={caja}>
            <h2 id="proximas" className={antetitulo}>
              Próximas
            </h2>
            <ul className="mt-2 grid divide-y divide-[var(--padel-linea)]">
              {otras.map((c) => (
                <li key={c.id} className="grid gap-2 py-3" data-qa="otra-clase">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold tabular-nums">{cuando(c.empiezaEn)}</span>
                    <ChipEstado c={c} profe={profe} />
                  </div>
                  {acciones(c)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {terminales.map((c) => (
          <section key={c.id} aria-label="Clase que ya no va" className={`${caja} border-dashed`} data-qa="ya-no-va">
            <p className="text-lg font-bold tabular-nums text-[var(--padel-suave)] line-through decoration-2">{cuando(c.empiezaEn)}</p>
            <p className="mt-1 text-base" data-qa={c.estado === "SIN_RESPUESTA" ? "sin-respuesta" : c.estado === "RECHAZADA" ? "rechazada" : "cancelada"}>
              {explicacionTerminal(c, profe)}
            </p>
            <a href={`/clases?fecha=${c.empiezaEn.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })}`} className={`${botonBorde} mt-3 w-full`} data-qa="elegir-otro">
              Elegir otro horario
            </a>
          </section>
        ))}

        {ofrecerRepetir && repetir && base && (
          <section aria-labelledby="repetir" className={caja}>
            <h2 id="repetir" className={tituloCaja}>
              ¿La semana que viene igual?
            </h2>
            <Repetir token={token} horaIso={repetir.toISOString()} repiteDe={base.id} etiqueta={`${diaHumano(repetir)} a las ${horaHumana(repetir)}`} profe={profe} />
          </section>
        )}

        {proxima && (
          <a href="/clases" className={`${botonBorde} w-full`} data-qa="pedir-otra">
            Pedir otra clase
          </a>
        )}

        {historial.length > 0 && (
          <details className={caja} data-qa="historial">
            <summary className="flex min-h-12 cursor-pointer items-center text-base font-bold">
              Historial · {alumno.dadas} clase{alumno.dadas === 1 ? "" : "s"} con {profe}
            </summary>
            <ul className="mt-2 grid divide-y divide-[var(--padel-linea)] text-base">
              {historial.map((c) => (
                <li key={c.id} className="flex flex-wrap justify-between gap-x-3 py-2">
                  <span className="tabular-nums">{cuando(c.empiezaEn)}</span>
                  <span className="text-[var(--padel-suave)]">
                    {chipEstado(c.estado, profe).texto} · {etiquetaPago(c)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-[var(--padel-suave)]">Se muestran las últimas 10.</p>
          </details>
        )}

        <Contacto wa={wa} profe={profe} token={token} conocido />
        <Instalar nombreApp={nombreApp} />
      </main>
    </Piel>
  );
}
