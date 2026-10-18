// Lo puro del Studio de redes (studio-core.ts) y el dibujo de la placa con un lienzo falso (studio-placa.ts): las
// plantillas, el caption en criollo, el partido de renglones, las medidas de cada formato, el estado inicial desde la
// difusión y lo que se agenda en el calendario. Los casos del caption y los renglones son los mismos del vanilla
// (src/tenants/breakpoint/studio.test.ts): el Studio de React tiene que decir lo mismo que el de hoy.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as vanilla from "../../../../../public/previews/breakpoint/club/studio.mjs";
import {
  CLUB,
  FORMATOS,
  OPCIONES_PLANTILLA,
  PLANTILLAS,
  ajustarLineas,
  armarCaption,
  datosParaGuardar,
  descripcionDeLaPlaca,
  estadoInicial,
  etiquetaDelCampo,
  lineasHorarios,
  medidasDeLaPlaca,
  motivoParaNoUsarLaFoto,
  nombreArchivo,
  partirLineas,
  piezaDeLaDifusion,
  pistaDelCampo,
  valoresDeLaPlantilla,
  type ClavePlantilla,
} from "./studio-core";
import { dibujarPieza } from "./studio-placa";

/* eslint-disable @typescript-eslint/no-explicit-any -- el vanilla es JS plano y el lienzo falso es un Proxy */
const V: any = vanilla;

// Medida falsa y determinística: 10 px por carácter.
const medir = (t: string) => t.length * 10;

test("partirLineas respeta el ancho, los saltos de línea y corta palabras más anchas que el renglón", () => {
  assert.deepEqual(partirLineas("hola que tal", 70, medir), ["hola", "que tal"]);
  assert.deepEqual(partirLineas("uno\ndos tres", 200, medir), ["uno", "dos tres"]);
  assert.deepEqual(partirLineas("supercalifragilistico", 50, medir), ["super", "calif", "ragil", "istic", "o"]);
  assert.deepEqual(partirLineas("", 100, medir), []);
  for (const l of partirLineas("Torneo relámpago de primavera en Break Point", 120, medir)) assert.ok(medir(l) <= 120, l);
});

test("ajustarLineas deja el tope y termina en «…» dentro del ancho", () => {
  assert.deepEqual(ajustarLineas(["a", "b"], 3, 100, medir), ["a", "b"]);
  const r = ajustarLineas(["primera", "segunda", "tercera"], 2, 80, medir);
  assert.equal(r.length, 2);
  assert.ok(r[1].endsWith("…") && medir(r[1]) <= 80, r[1]);
  assert.deepEqual(ajustarLineas(["x", "y"], 0, 100, medir), []);
});

test("el caption dice lo mismo que el Studio de hoy en las cinco plantillas (con ejemplo, vacío y con basura)", () => {
  for (const p of Object.keys(PLANTILLAS) as ClavePlantilla[]) {
    assert.equal(armarCaption(p, PLANTILLAS[p].ejemplo), V.armarCaption(p, PLANTILLAS[p].ejemplo), p);
    assert.equal(armarCaption(p, {}), V.armarCaption(p, {}), `${p} vacío`);
  }
  assert.equal(armarCaption("nada", { titulo: "Hola" }), V.armarCaption("nada", { titulo: "Hola" }));
});

test("el caption del torneo: en criollo, con el WhatsApp del club, «cupos limitados» y 3 o 4 hashtags; sin renglones vacíos", () => {
  const c = armarCaption("torneo", { titulo: "Relámpago", categorias: "5ta", cuando: "Sábado 9", inscripcion: "", premio: "Paletas" });
  assert.match(c, /^🏆 Relámpago\n\n🎾 Categorías: 5ta\n📅 Sábado 9\n🥇 Premios: Paletas/);
  assert.ok(!c.includes("Inscripción"), "lo vacío no sale");
  assert.ok(c.includes(`Anotate por WhatsApp al ${CLUB.whatsapp}`));
  assert.ok(!/\n\n\n/.test(c), "nunca dos renglones en blanco");
  const tags = c.split("\n").at(-1)!.split(" ");
  assert.ok(tags.length >= 3 && tags.length <= 4 && tags.every((t) => t.startsWith("#")), tags.join(" "));
  // Turnos: un renglón con viñeta por horario.
  assert.match(armarCaption("turnos", { horarios: "10:00\n\n 11:30 " }), /• 10:00\n• 11:30/);
  // Buffet: el precio va al lado del plato.
  assert.match(armarCaption("buffet", { titulo: "Milanesa", precio: "$14.500" }), /^🍽️ Milanesa · \$14\.500/);
});

test("lineasHorarios: uno por renglón, sin vacíos, hasta 12", () => {
  assert.deepEqual(lineasHorarios(" 10:00 \n\n11:00"), ["10:00", "11:00"]);
  assert.equal(lineasHorarios(Array.from({ length: 20 }, (_, i) => `${i}:00`).join("\n")).length, 12);
  assert.deepEqual(lineasHorarios(null), []);
});

test("medidas de la placa: 1080 de ancho, márgenes de 84 y la zona que tapa Instagram libre en la historia", () => {
  for (const f of Object.keys(FORMATOS) as (keyof typeof FORMATOS)[]) {
    const m = medidasDeLaPlaca(f);
    assert.equal(m.ancho, 1080);
    assert.equal(m.alto, FORMATOS[f].alto);
    assert.equal(m.anchoUtil, 1080 - 2 * 84);
    assert.ok(m.cuerpoDesde < m.cuerpoHasta && m.cuerpoHasta < m.ctaY && m.ctaY + m.altoCta < m.abajo && m.abajo < m.alto, f);
  }
  const h = medidasDeLaPlaca("historia");
  assert.equal(h.historia, true);
  assert.ok(h.arriba >= 240, "arriba tapa el usuario");
  assert.ok(h.alto - h.abajo >= 250, "abajo tapa «responder»");
  assert.equal(medidasDeLaPlaca("cualquiera").alto, 1080, "un formato desconocido es el post");
  assert.deepEqual([FORMATOS.post.alto, FORMATOS.vertical.alto, FORMATOS.historia.alto], [1080, 1350, 1920]);
});

test("las plantillas: cada una usa campos que existen, tiene su ejemplo y etiquetas propias", () => {
  assert.deepEqual(
    OPCIONES_PLANTILLA.map((o) => o.valor),
    ["torneo", "promo", "turnos", "novedad", "buffet"],
  );
  for (const [k, P] of Object.entries(PLANTILLAS)) {
    assert.ok(P.campos.includes("titulo"), k);
    assert.ok(P.ejemplo.titulo, `${k} tiene ejemplo`);
  }
  assert.equal(etiquetaDelCampo("torneo", "titulo"), "Nombre del torneo");
  assert.equal(etiquetaDelCampo("novedad", "titulo"), "Título");
  assert.equal(etiquetaDelCampo("buffet", "titulo"), "Plato");
  assert.equal(pistaDelCampo("torneo", "texto"), "Ej.: Buffet abierto todo el día.", "la pista no se carga, sólo se sugiere");
  assert.equal(pistaDelCampo("turnos", "horarios"), "Ej.: 10:00 · Cancha 1", "sólo el primer renglón");
  assert.equal(pistaDelCampo("novedad", "precio"), "");
});

test("estado inicial: sin pieza, el ejemplo del torneo con el día del CLUB; con la difusión, lo que trae", () => {
  const vacio = estadoInicial(null, "2026-10-17");
  assert.equal(vacio.plantilla, "torneo");
  assert.equal(vacio.formato, "post");
  assert.equal(vacio.fecha, "2026-10-17", "el día del reloj del club, no el del equipo");
  assert.equal(vacio.hora, "19:00");
  assert.equal(vacio.valores.titulo, PLANTILLAS.torneo.ejemplo.titulo);
  assert.equal(vacio.valores.texto, "", "la pista del torneo no se carga");
  assert.deepEqual(vacio.tocados, []);

  const pieza = piezaDeLaDifusion({ tipo: "promo", titulo: "2x1 de valle", texto: "Lunes a viernes." });
  assert.deepEqual(pieza, { plantilla: "promo", titulo: "2x1 de valle", texto: "Lunes a viernes." });
  const conPieza = estadoInicial(pieza, "2026-10-17");
  assert.equal(conPieza.plantilla, "promo");
  assert.equal(conPieza.valores.titulo, "2x1 de valle");
  assert.equal(conPieza.valores.precio, "", "lo que no trajo queda vacío (no el ejemplo)");
  assert.equal(conPieza.deLaPieza, true);
  assert.equal(piezaDeLaDifusion({ tipo: "novedad", titulo: "", texto: "" }).plantilla, "novedad");
  assert.equal(piezaDeLaDifusion({ tipo: "turnos", titulo: "", texto: "" }).plantilla, "turnos");
  // Como el vanilla: una pieza sin plantilla con precio es promo; la historia sale del canal.
  const sinPlantilla = estadoInicial({ titulo: "x", precio: "$1", canal: "historia", fecha: "2026-11-01", hora: "09:30" }, "2026-10-17");
  assert.deepEqual([sinPlantilla.plantilla, sinPlantilla.formato, sinPlantilla.fecha, sinPlantilla.hora], ["promo", "historia", "2026-11-01", "09:30"]);
  const mal = estadoInicial({ fecha: "mañana", hora: "25:00" }, "2026-10-17");
  assert.deepEqual([mal.fecha, mal.hora], ["2026-10-17", "19:00"]);
});

test("cambiar de plantilla: lo tocado queda, lo que nadie tocó toma el ejemplo de la nueva", () => {
  const st = estadoInicial(null, "2026-10-17");
  const a = valoresDeLaPlantilla("buffet", { ...st.valores, titulo: "Mi torneo" }, ["titulo"]);
  assert.equal(a.titulo, "Mi torneo");
  assert.equal(a.precio, PLANTILLAS.buffet.ejemplo.precio);
  const b = valoresDeLaPlantilla("buffet", st.valores, []);
  assert.equal(b.titulo, PLANTILLAS.buffet.ejemplo.titulo);
});

test("lo que se agenda: una publicación PROGRAMADA, con el canal del formato; sin fecha, hora o caption, el motivo", () => {
  const base = { plantilla: "torneo", formato: "historia", valores: { titulo: "  Relámpago  " }, caption: " Texto ", fecha: "2026-10-20", hora: "19:00" };
  assert.deepEqual(datosParaGuardar(base), { ok: true, datos: { titulo: "Relámpago", texto: "Texto", canal: "historia", estado: "programado", fecha: "2026-10-20", hora: "19:00" } });
  const post = datosParaGuardar({ ...base, formato: "vertical", valores: {} });
  assert.ok(post.ok && post.datos.canal === "post" && post.datos.titulo === "Torneo", "sin título, el nombre de la plantilla");
  assert.deepEqual(datosParaGuardar({ ...base, fecha: "" }), { ok: false, motivo: "Elegí la fecha de publicación." });
  assert.deepEqual(datosParaGuardar({ ...base, hora: "7" }), { ok: false, motivo: "Elegí la hora de publicación." });
  assert.equal((datosParaGuardar({ ...base, caption: "  " }) as { motivo: string }).motivo, "El caption está vacío: escribí algo o tocá «Volver al sugerido».");
  const largo = datosParaGuardar({ ...base, valores: { titulo: "x".repeat(200) } });
  assert.ok(largo.ok && largo.datos.titulo.length === 120);
});

test("nombre del PNG, la foto de fondo y la descripción de la vista previa", () => {
  assert.equal(nombreArchivo("torneo", "2026-10-16"), "breakpoint-torneo-2026-10-16.png");
  assert.equal(nombreArchivo("otra", ""), "breakpoint-pieza-sin-fecha.png");
  assert.equal(motivoParaNoUsarLaFoto({ type: "image/jpeg", size: 2_000_000 }), null);
  assert.match(motivoParaNoUsarLaFoto({ type: "application/pdf", size: 10 })!, /no es una imagen/);
  assert.match(motivoParaNoUsarLaFoto({ type: "image/png", size: 16 * 1024 * 1024 })!, /más de 15 MB/);
  assert.equal(descripcionDeLaPlaca({ plantilla: "promo", formato: "historia", valores: { ...estadoInicial(null, "2026-10-17").valores, titulo: " " } }), "Vista previa: Promo, historia, sin título");
});

/** Un lienzo falso: anota lo que se escribe y mide 0,55 del tamaño de la letra por carácter. */
function lienzoFalso() {
  const textos: string[] = [];
  const canvas = { width: 300, height: 150 };
  let font = "10px sans-serif";
  const tam = () => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10);
  const ctx: any = new Proxy(
    {},
    {
      get(_, k) {
        if (k === "canvas") return canvas;
        if (k === "font") return font;
        if (k === "measureText") return (t: string) => ({ width: t.length * tam() * 0.55 });
        if (k === "fillText") return (t: string) => textos.push(t);
        if (k === "createLinearGradient") return () => ({ addColorStop() {} });
        if (k === "roundRect") return undefined; // como un navegador viejo: cae al rect
        return () => {};
      },
      set(_, k, v) {
        if (k === "font") font = v;
        return true;
      },
      has: (_, k) => k === "letterSpacing",
    },
  );
  return { ctx, canvas, textos };
}

test("la placa: toma el tamaño del formato, lleva el usuario, el WhatsApp, el rótulo y el llamado; avisa si recorta", () => {
  for (const p of Object.keys(PLANTILLAS) as ClavePlantilla[]) {
    for (const f of Object.keys(FORMATOS) as (keyof typeof FORMATOS)[]) {
      const { ctx, canvas, textos } = lienzoFalso();
      dibujarPieza(ctx, { plantilla: p, formato: f, valores: PLANTILLAS[p].ejemplo });
      assert.deepEqual([canvas.width, canvas.height], [FORMATOS[f].ancho, FORMATOS[f].alto], `${p}/${f}`);
      assert.ok(textos.includes(CLUB.usuario) && textos.includes(`Reservas: ${CLUB.whatsapp}`), `${p}/${f}: el pie`);
      assert.ok(textos.includes(PLANTILLAS[p].rotulo), `${p}/${f}: el rótulo`);
      assert.ok(textos.includes(`${PLANTILLAS[p].cta}  →`), `${p}/${f}: el llamado`);
    }
  }
  const corto = lienzoFalso();
  assert.equal(dibujarPieza(corto.ctx, { plantilla: "novedad", formato: "post", valores: { titulo: "Hola", texto: "Mañana abrimos a las 8." } }).recortado, false, "lo corto entra entero");
  const { ctx, textos } = lienzoFalso();
  const r = dibujarPieza(ctx, { plantilla: "novedad", formato: "post", valores: { titulo: "Hola", texto: "palabra ".repeat(400) } });
  assert.equal(r.recortado, true, "un texto larguísimo no entra: se avisa");
  assert.ok(textos.some((t) => t.endsWith("…")), "y se corta con «…»");
  const sinTitulo = lienzoFalso();
  dibujarPieza(sinTitulo.ctx, { plantilla: "novedad", formato: "post", valores: {} });
  assert.ok(sinTitulo.textos.some((t) => t.startsWith("NOVEDAD DEL")), "sin título, el nombre de la plantilla en mayúsculas");
});
