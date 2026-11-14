// La pestaña Diseño de la ficha. Los paneles se exportan por separado porque Propuesta con IA usa los mismos.

import Link from "next/link";
import { Suspense } from "react";
import { Badge, cn } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { fechaCorta, fechaParaInput, yaVencio } from "@/lib/proyectos/core";
import { esDelEstudio, ETIQUETA_ESTUDIO, estadoDeVersion, esMarcaDeRevision, leerLaminas, normalizarImagenes, normalizarMoodboards, revisionVigente, srcDeImagen } from "@/lib/proyectos/diseno-core";
import { personasAsignables } from "@/lib/proyectos/diseno.server";
import { actorActual, filtroDeProyectos, proyectoVisible, puede, type Actor } from "@/lib/proyectos/gestion.server";
import { iaConectada, imagenesConectadas } from "@/lib/proyectos/ia.server";
import { etapa2ActivaPara } from "@/lib/proyectos/etapa2.server";
import { FaltaIA, FaltanImagenes } from "./_diseno-avisos";
import { EstudioImagenes } from "./_diseno-estudio";
import { FormIdea, GrillaImagenes, Moodboards } from "./_diseno-idea";
import { Presentaciones } from "./_diseno-presentaciones";
import { SubirVersionDiseno } from "./_diseno-subir";
import { SubpestanasDiseno } from "./_diseno-subpestanas";
import { TableroTareas, type TareaTablero } from "./_diseno-tablero";
import { tarjeta } from "./_vista";

export function aTareaTablero(t: { id: string; titulo: string; estado: string; area: string; proyectoId: string; personaId: string | null; responsable: string | null; venceEl: Date | null; proyecto: { nombre: string } }, hoy: Date): TareaTablero {
  return {
    id: t.id,
    titulo: t.titulo,
    estado: t.estado,
    area: t.area,
    proyectoId: t.proyectoId,
    proyecto: t.proyecto.nombre,
    personaId: t.personaId,
    responsable: t.responsable,
    vence: t.venceEl ? fechaCorta(t.venceEl) : null,
    venceInput: fechaParaInput(t.venceEl),
    vencida: yaVencio(t.venceEl, hoy) && t.estado !== "APROBADA",
  };
}

export async function PanelTareas({ a, proyectoId }: { a: Actor; proyectoId: string }) {
  const [tareas, asignables, proyecto] = await Promise.all([
    prisma.proyectoTarea.findMany({
      where: { tenantId: a.tenantId, proyectoId, area: "DISENO" },
      orderBy: [{ venceEl: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 200,
      select: { id: true, titulo: true, estado: true, area: true, proyectoId: true, personaId: true, responsable: true, venceEl: true, proyecto: { select: { nombre: true } } },
    }),
    personasAsignables(a.tenantId),
    prisma.proyecto.findFirst({ where: { id: proyectoId, tenantId: a.tenantId }, select: { id: true, nombre: true } }),
  ]);
  const hoy = new Date();
  return (
    <TableroTareas
      proyectoFijo={proyectoId}
      tareas={tareas.map((t) => aTareaTablero(t, hoy))}
      proyectos={proyecto ? [proyecto] : []}
      personas={asignables.personas}
      equipoPorProyecto={asignables.equipoPorProyecto}
      miPersonaId={a.personaId}
      puedeEditar={puede(a, "diseno", "editar")}
    />
  );
}

export async function PanelVersiones({ a, proyectoId }: { a: Actor; proyectoId: string }) {
  const piezas = await prisma.proyectoEntregable.findMany({
    where: { tenantId: a.tenantId, proyectoId, anuladoEl: null },
    orderBy: { createdAt: "asc" },
    take: 60,
    select: {
      id: true,
      nombre: true,
      venceEl: true,
      // Sólo la última versión, sin la imagen: la imagen viaja aparte y con permiso.
      versiones: { orderBy: { numero: "desc" }, take: 1, select: { id: true, numero: true, estado: true, url: true, subidoPor: true, createdAt: true, comentarios: { select: { texto: true, createdAt: true } } } },
    },
  });
  const puedeEditar = puede(a, "diseno", "editar");
  return (
    <div className="grid gap-4">
      {puedeEditar && (
        <section className={tarjeta} aria-label="Subir versión">
          <h3 className="mb-3 font-semibold text-strong">Subir una versión</h3>
          <SubirVersionDiseno proyectoId={proyectoId} piezas={piezas.map((p) => ({ id: p.id, nombre: p.nombre, hayBorrador: p.versiones[0]?.estado === "BORRADOR" }))} />
        </section>
      )}
      {piezas.length === 0 && <p className="text-sm text-muted">Todavía no hay piezas en este proyecto.</p>}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {piezas.map((p) => {
          const v = p.versiones[0];
          if (!v) {
            return (
              <li key={p.id} className={cn(tarjeta, "min-w-0")}>
                <p className="break-words font-medium text-strong">{p.nombre}</p>
                <p className="text-sm text-muted">Sin versiones todavía</p>
              </li>
            );
          }
          const estado = estadoDeVersion(v.estado, revisionVigente(v.comentarios));
          const comentarios = v.comentarios.filter((c) => !esMarcaDeRevision(c.texto)).length;
          const src = v.url ? null : srcDeImagen(v.id);
          return (
            <li key={p.id} className="min-w-0">
              <Link href={`/admin/proyectos/diseno/version/${v.id}`} className={cn(tarjeta, "grid h-full min-w-0 gap-2 hover:border-accent")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {src ? <img src={src} alt={`${p.nombre}, versión ${v.numero}`} loading="lazy" className="aspect-[4/3] w-full rounded-lg border border-line object-cover" /> : <span className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-line text-sm text-muted">Link externo</span>}
                <span className="break-words font-medium text-strong">{p.nombre} · v{v.numero}</span>
                <span className="text-sm text-muted">{[v.subidoPor, fechaCorta(v.createdAt)].filter(Boolean).join(" · ")}</span>
                <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  {comentarios} {comentarios === 1 ? "comentario" : "comentarios"}
                  <Badge tone={/Aprobada/.test(estado) ? "success" : /[Cc]ambios/.test(estado) ? "danger" : "neutral"}>{estado}</Badge>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Lo que se puede elegir para la ficha: lo del Estudio y las versiones con imagen, más lo que ya esté elegido. */
async function imagenesParaElegir(a: Actor, proyectoId: string, elegidas: readonly string[]) {
  const [estudio, versiones] = await Promise.all([
    prisma.proyectoArchivo.findMany({ where: { tenantId: a.tenantId, proyectoId, datos: { not: null }, nombre: { startsWith: ETIQUETA_ESTUDIO } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, nombre: true } }),
    prisma.proyectoEntregableVersion.findMany({ where: { tenantId: a.tenantId, url: null, entregable: { proyectoId, anuladoEl: null } }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, numero: true, entregable: { select: { nombre: true } } } }),
  ]);
  const lista = [
    ...estudio.map((e) => ({ ref: `archivo:${e.id}`, nombre: esDelEstudio(e.nombre) ? e.nombre.slice(ETIQUETA_ESTUDIO.length) : e.nombre })),
    ...versiones.map((v) => ({ ref: v.id, nombre: `${v.entregable.nombre} · v${v.numero}` })),
  ];
  const conocidas = new Set(lista.map((i) => i.ref));
  const sueltas = elegidas.filter((r) => !conocidas.has(r)).map((ref) => ({ ref, nombre: "Imagen elegida" }));
  return [...lista, ...sueltas].map((i) => ({ ...i, elegida: elegidas.includes(i.ref) }));
}

async function leerIdea(a: Actor, proyectoId: string) {
  const idea = await prisma.proyectoIdea.findFirst({ where: { tenantId: a.tenantId, proyectoId }, select: { concepto: true, narrativa: true, referencias: true, materialidades: true, informacion: true, imagenes: true, moodboards: true } });
  return {
    textos: { concepto: idea?.concepto ?? "", narrativa: idea?.narrativa ?? "", referencias: idea?.referencias ?? "", materialidades: idea?.materialidades ?? "", informacion: idea?.informacion ?? "" },
    imagenes: normalizarImagenes(idea?.imagenes),
    moodboards: normalizarMoodboards(idea?.moodboards),
  };
}

export async function PanelIdea({ a, proyectoId, mostrarPedido }: { a: Actor; proyectoId: string; mostrarPedido?: boolean }) {
  const idea = await leerIdea(a, proyectoId);
  const puedeEditar = puede(a, "diseno", "editar");
  // Etapa 2: los asistentes con IA se prenden por negocio (apagados por defecto).
  const iaActiva = await etapa2ActivaPara(a.tenantId, "ia");
  const iaLista = iaActiva && iaConectada() && puede(a, "ia", "editar");
  const disponibles = await imagenesParaElegir(a, proyectoId, idea.imagenes);
  return (
    <div className="grid gap-4">
      {puedeEditar && iaActiva && !iaConectada() && <FaltaIA mientras="Mientras tanto, la idea se escribe a mano." />}
      <section className={tarjeta} aria-label="Ficha de la idea">
        <FormIdea proyectoId={proyectoId} inicial={idea.textos} puedeEditar={puedeEditar} iaLista={iaLista} mostrarPedido={mostrarPedido} />
      </section>
      <section className={tarjeta} aria-label="Imágenes elegidas">
        <h3 className="mb-3 font-semibold text-strong">Imágenes elegidas ({idea.imagenes.length})</h3>
        <GrillaImagenes proyectoId={proyectoId} imagenes={disponibles} puedeEditar={puedeEditar} vacio="Todavía no hay imágenes: subí una versión o usá el Estudio." />
      </section>
      <section className={tarjeta} aria-label="Moodboards vinculados">
        <h3 className="mb-3 font-semibold text-strong">Moodboards vinculados</h3>
        <Moodboards proyectoId={proyectoId} moodboards={idea.moodboards} puedeEditar={puedeEditar} />
      </section>
    </div>
  );
}

export async function PanelEstudio({ a, proyectoId }: { a: Actor; proyectoId: string }) {
  const idea = await leerIdea(a, proyectoId);
  const elegibles = (await imagenesParaElegir(a, proyectoId, idea.imagenes)).filter((i) => i.ref.startsWith("archivo:"));
  const puedeEditar = puede(a, "diseno", "editar");
  const iaActiva = await etapa2ActivaPara(a.tenantId, "ia");
  const conectado = imagenesConectadas();
  return (
    <div className="grid gap-4">
      <p role="note" className="rounded-xl border border-line bg-surface p-3 text-sm text-strong">Estas imágenes orientan la idea. No reemplazan planos, medidas ni el trabajo técnico.</p>
      {iaActiva && !conectado && <FaltanImagenes mientras="Mientras tanto, subí una imagen a mano: elegirla para la ficha y usarla en la presentación funciona igual." />}
      <section className={tarjeta} aria-label="Pedido">
        <EstudioImagenes proyectoId={proyectoId} conectado={conectado} puedeGenerar={iaActiva && puede(a, "ia", "editar") && puedeEditar} puedeSubir={puedeEditar} />
      </section>
      <section className={tarjeta} aria-label="Imágenes del Estudio">
        <h3 className="mb-3 font-semibold text-strong">Imágenes del Estudio</h3>
        <GrillaImagenes proyectoId={proyectoId} imagenes={elegibles} puedeEditar={puedeEditar} vacio="Todavía no hay imágenes en el Estudio." />
      </section>
    </div>
  );
}

export async function PanelPresentaciones({ a, proyectoId }: { a: Actor; proyectoId: string }) {
  const filas = await prisma.proyectoPresentacion.findMany({ where: { tenantId: a.tenantId, proyectoId }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, nombre: true, plantilla: true, laminas: true, estado: true, respuesta: true, createdAt: true } });
  return (
    <Presentaciones
      proyectoId={proyectoId}
      puedeEditar={puede(a, "diseno", "editar")}
      filas={filas.map((f) => ({ id: f.id, nombre: f.nombre, plantilla: f.plantilla, laminas: leerLaminas(f.laminas).length, estado: f.estado, respuesta: f.respuesta, fecha: fechaCorta(f.createdAt) }))}
    />
  );
}

export async function PestanaDiseno({ proyectoId }: { proyectoId: string }) {
  const a = await actorActual();
  if (!puede(a, "diseno", "ver")) return <p className="text-sm text-muted">Tu rol no ve Diseño.</p>;
  if (!(await proyectoVisible(a, proyectoId))) return <p className="text-sm text-muted">Este proyecto no está entre los tuyos.</p>;
  return (
    <Suspense fallback={<p className="text-sm text-muted">Cargando…</p>}>
      <SubpestanasDiseno
        paneles={{
          tareas: <PanelTareas a={a} proyectoId={proyectoId} />,
          versiones: <PanelVersiones a={a} proyectoId={proyectoId} />,
          idea: <PanelIdea a={a} proyectoId={proyectoId} />,
          estudio: <PanelEstudio a={a} proyectoId={proyectoId} />,
          presentaciones: <PanelPresentaciones a={a} proyectoId={proyectoId} />,
        }}
      />
    </Suspense>
  );
}

/** Los proyectos que esta persona puede elegir en los tableros. */
export async function proyectosElegibles(a: Actor) {
  return prisma.proyecto.findMany({ where: { ...filtroDeProyectos(a), perdidoEl: null, etapa: { not: "CIERRE" } }, orderBy: { numero: "desc" }, take: 200, select: { id: true, nombre: true } });
}
