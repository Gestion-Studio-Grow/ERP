import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { buttonClasses, cn, Plata } from "@/components/ui";
import { badgePendientes, ficha } from "@/lib/padel/datos.server";
import { gestionaClases, veLaPlataDelDia } from "@/lib/padel/plata-guardia";
import { MEDIO_LABEL, PAGO_LABEL, diaHumano, horaHumana, linkWhatsApp, textoSerie, type EstadoClase, type EstadoPago, type MedioPago } from "@/lib/padel/core";
import { ChipEstado, tarjeta } from "../../_vista";
import { Cabecera } from "../../_cabecera";
import { CobrarTodo, LeDevolvi, Recordarle } from "../../plata/_acciones-plata";
import { EditarAlumno, MandarLink, NotasAlumno, RegenerarLink } from "./_ficha";
import { AnularPaquete, VenderPaquete } from "./_paquete";
import { puedeAnularPaquete, textoQuedan } from "@/lib/padel/paquetes-core";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Ficha del alumno", manifest: "/clases/app.webmanifest" };

/** «11 5555-1234» para un celular de 10 dígitos del AMBA; el resto, como está. */
function celularLindo(t: string): string {
  return /^11\d{8}$/.test(t) ? `11 ${t.slice(2, 6)}-${t.slice(6)}` : t;
}

const seccion = "mb-5";
const titulo = "mb-2 text-sm font-bold uppercase tracking-wide text-strong";

// LA FICHA (matias-DISENO.md §2.3 · M-071): datos y contacto arriba (WhatsApp, Mandarle su link,
// Agendar), las próximas, lo que debe con «Cobrar todo», lo que tiene a favor, las últimas 10 con
// su pago y las notas. Todo de ESTE negocio: un id de otro negocio da «No encontramos» (404).
export default async function FichaAlumno({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireApp("padel-clases");
  // El PROFESSIONAL no ve montos ni cobra, ni ve acciones que exigen agenda:manage (certificación
  // vueltas 3 y 4 del arreglo UAT 11/2026).
  const conPlata = veLaPlataDelDia(user);
  // Agendar y guardar las notas exigen agenda:manage: sin él, las notas se leen y no se editan.
  const gestiona = gestionaClases(user);
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) notFound();
  const [a, numero] = await Promise.all([ficha(id), badgePendientes()]);
  if (!a) notFound();
  const wa = linkWhatsApp(a.telefono, `Hola ${a.nombre.split(" ")[0]}!`);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <Link href="/admin/clases/alumnos" className="mb-2 inline-flex min-h-12 items-center text-sm font-semibold text-accent-ink underline-offset-2 hover:underline">
        ‹ Alumnos
      </Link>
      <Cabecera
        titulo={a.nombre}
        detalle={[celularLindo(a.telefono), a.nivel, `${a.dadas} clase${a.dadas === 1 ? "" : "s"} con vos`].filter(Boolean).join(" · ")}
        pendientes={numero}
      />

      <div className="mb-5 grid gap-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(buttonClasses("outline", "lg"), "h-12 w-full justify-center")} data-qa="whatsapp-alumno">
              WhatsApp
            </a>
          ) : (
            <span className="flex h-12 items-center justify-center rounded-xl border border-dashed border-line px-2 text-center text-sm text-muted">Sin celular</span>
          )}
          {gestiona && (
            <Link href={`/admin/clases/agendar?alumno=${encodeURIComponent(a.id)}`} className={cn(buttonClasses("solid", "lg"), "h-12 w-full justify-center")} data-qa="agendar-alumno">
              Agendar
            </Link>
          )}
          {conPlata && (
            <>
              <div className="col-span-2 sm:col-span-1">
                <MandarLink alumnoId={a.id} nombre={a.nombre} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <EditarAlumno alumnoId={a.id} nombre={a.nombre} telefono={a.telefono} nivel={a.nivel} />
              </div>
            </>
          )}
        </div>
      </div>

      <section className={seccion} aria-labelledby="t-proximas">
        <h2 id="t-proximas" className={titulo}>Próximas</h2>
        {a.proximas.length === 0 ? (
          <p className="text-sm text-muted">No tiene clases agendadas.</p>
        ) : (
          <ul className="grid gap-2">
            {a.proximas.map((c) => (
              <li key={c.id} className={cn(tarjeta, "flex flex-wrap items-center justify-between gap-2 py-3")} data-qa="proxima-alumno">
                <span className="font-semibold capitalize text-strong">
                  {diaHumano(c.empiezaEn)} · <span className="tabular-nums">{horaHumana(c.empiezaEn)}</span>
                  {c.club && <span className="font-normal normal-case text-muted"> · {c.club.nombre}</span>}
                </span>
                <ChipEstado estado={c.estado as EstadoClase} pago={conPlata ? (c.pagoEstado as EstadoPago) : undefined} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {a.series.length > 0 && (
        <section className={seccion} aria-labelledby="t-fijas">
          <h2 id="t-fijas" className={titulo}>Clases fijas</h2>
          <ul className="grid gap-2">
            {a.series.map((x) => (
              <li key={x.id} className={cn(tarjeta, "flex flex-wrap items-center justify-between gap-2 py-3")} data-qa="serie-alumno">
                <span className="font-semibold text-strong">
                  {textoSerie(x)}
                  {x.club && <span className="font-normal text-muted"> · {x.club}</span>}
                </span>
                <span className={cn("text-sm", x.activa ? "font-semibold text-success" : "text-muted")}>
                  {x.activa ? "Activa" : x.hasta ? `Terminó el ${x.hasta.split("-").reverse().join("/")}` : "Terminada"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">Para cortar una, cancelá una de sus clases y elegí «Esta y las que siguen».</p>
        </section>
      )}

      {conPlata && (
        <section className={cn(tarjeta, seccion, "grid gap-3")} aria-labelledby="t-plata">
        <h2 id="t-plata" className="text-sm font-bold uppercase tracking-wide text-strong">Plata</h2>
        {a.debe > 0 ? (
          <>
            <p className="text-base font-semibold text-danger" data-qa="ficha-debe">
              Debe <Plata valor={a.debe} sinCentavos tono="peligro" /> · {a.deudas.length + a.partesDeudas.length} clase{a.deudas.length + a.partesDeudas.length === 1 ? "" : "s"}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <CobrarTodo alumnoId={a.id} nombre={a.nombre} total={a.debe} cantidad={a.deudas.length + a.partesDeudas.length} />
              <Recordarle alumnoId={a.id} nombre={a.nombre} />
            </div>
          </>
        ) : (
          <p className="text-base font-semibold text-success" data-qa="ficha-al-dia">Está al día ✓</p>
        )}
        {a.enRevision > 0 && (
          <Link href="/admin/clases/pendientes?ver=comprobantes" className="min-h-12 content-center text-sm font-semibold text-accent-ink underline underline-offset-2">
            Mandó un comprobante de <Plata valor={a.enRevision} sinCentavos />: revisalo en la campana
          </Link>
        )}
        {a.aFavor > 0 && (
          <>
            <p className="text-sm text-strong" data-qa="ficha-a-favor">
              Tiene <Plata valor={a.aFavor} sinCentavos tono="cobrado" className="font-semibold" /> a favor: la próxima clase se paga sola con eso.
            </p>
            {a.devolverId && <LeDevolvi claseId={a.devolverId} nombre={a.nombre} monto={a.devolverMonto} />}
          </>
        )}
        {/* T5 · Paquetes: sin la migración aplicada (disponible: false) la sección no aparece. */}
        {a.paquetes.disponible && (
          <div className="grid gap-2 border-t border-line pt-3" data-qa="ficha-paquetes">
            <p className={cn("text-base font-semibold", a.paquetes.quedan > 0 ? "text-success" : "text-strong")} data-qa="ficha-paquete-quedan">
              Paquete: {a.paquetes.paquetes.length ? textoQuedan(a.paquetes.quedan).toLowerCase() : "no tiene"}
            </p>
            {a.paquetes.paquetes.length > 0 && (
              <ul className="grid gap-1.5" aria-label="Paquetes">
                {a.paquetes.paquetes.map((p) => (
                  <li key={p.id} className={cn("flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm", p.anuladoEl && "border-dashed text-muted")} data-qa="paquete">
                    <span className="text-strong">
                      {p.clases} clases · <Plata valor={p.precio} sinCentavos /> · {MEDIO_LABEL[p.pagoMedio as MedioPago]?.toLowerCase() ?? p.pagoMedio}
                      <span className="text-muted"> · {diaHumano(p.pagadoEl)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-muted">{p.anuladoEl ? "Anulado" : `usó ${p.usadas} · ${textoQuedan(p.quedan).toLowerCase()}`}</span>
                      {puedeAnularPaquete(p) && <AnularPaquete paqueteId={p.id} nombre={a.nombre} clases={p.clases} precio={p.precio} />}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <VenderPaquete alumnoId={a.id} nombre={a.nombre} />
          </div>
        )}
        </section>
      )}

      <section className={seccion} aria-labelledby="t-ultimas">
        <h2 id="t-ultimas" className={titulo}>Últimas clases</h2>
        {a.ultimas.length === 0 ? (
          <p className="text-sm text-muted">Todavía no tomó clases.</p>
        ) : (
          <ul className="grid gap-1.5">
            {a.ultimas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm" data-qa="ultima-alumno">
                <span className="capitalize text-strong">
                  {diaHumano(c.empiezaEn)} <span className="tabular-nums">{horaHumana(c.empiezaEn)}</span>
                </span>
                <span className="text-muted">
                  <ChipEstado estado={c.estado as EstadoClase} />
                  {conPlata && (c.estado === "DADA" || c.pagoEstado !== "PENDIENTE") ? (
                    <>
                      {" · "}
                      {PAGO_LABEL[c.pagoEstado as EstadoPago] ?? c.pagoEstado}
                      {c.pagoEstado === "PAGADO" && c.pagoMedio && ` ${MEDIO_LABEL[c.pagoMedio as MedioPago]?.toLowerCase() ?? ""}`}
                    </>
                  ) : null}
                  {conPlata && c.precio > 0 && (
                    <>
                      {" · "}
                      <Plata valor={c.precio} sinCentavos />
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {gestiona ? (
        <section className={seccion} aria-labelledby="t-notas">
          <h2 id="t-notas" className={titulo}>Notas</h2>
          <NotasAlumno alumnoId={a.id} nombre={a.nombre} notas={a.notas} />
        </section>
      ) : (
        a.notas.trim() && (
          <section className={seccion} aria-labelledby="t-notas">
            <h2 id="t-notas" className={titulo}>Notas</h2>
            <p className="whitespace-pre-line text-sm text-strong" data-qa="notas-solo-lectura">{a.notas}</p>
          </section>
        )
      )}

      {conPlata && <RegenerarLink alumnoId={a.id} nombre={a.nombre} />}
    </main>
  );
}
