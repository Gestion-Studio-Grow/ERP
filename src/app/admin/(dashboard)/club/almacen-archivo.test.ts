// El archivado de días cerrados en el almacén (`prepararArchivo` → `confirmar`, o `archivarDiasCerrados` de una vez):
// quién puede (rol OWNER + PIN de un dueño del club: el motor no lo valida), que el anexo se guarde ANTES que el estado
// achicado (y si falla, nada cambia), que «Deshacer» quede apagado, que sin `guardarAnexo` se exija la descarga, el
// aviso de «lleno» y la MEDICIÓN con un mes de club lleno (bytes y costo de abrir, antes y después).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import { armarMesCargado, HOY_TORNEO } from "@/lib/club/fixtures/armar-respaldo";
import {
  AVISO_LLENO,
  claveDeLaDemo,
  claveDeLaJornada,
  crearAlmacen,
  type AlmacenamientoLocal,
  type ArchivoPreparado,
  type GuardadoDelClub,
  type ResultadoDelArchivo,
  type ResultadoDelGuardado,
  type Temporizador,
} from "./almacen";
import { separarVersion } from "./guardado-del-club";

const NEGOCIO = "demo-club";
const CLAVE = claveDeLaJornada(NEGOCIO);
const DUENIO = { usuarioId: "u-duenio-1", pin: "11" };
const RECEPCION = { usuarioId: "u-recep-1", pin: "33" };
const vaciar = () => new Promise<void>((r) => setImmediate(r));
const temporizador: Temporizador = { despues: () => () => undefined, cada: () => () => undefined };

/** localStorage en memoria que anota el orden de las escrituras (y puede fallar para una clave). */
function memoria(fallaSi: (clave: string) => boolean = () => false) {
  const datos = new Map<string, string>();
  const escrituras: string[] = [];
  const m: AlmacenamientoLocal & { datos: Map<string, string>; escrituras: string[] } = {
    datos,
    escrituras,
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => {
      if (fallaSi(k)) throw new Error("QuotaExceededError");
      escrituras.push(k);
      datos.set(k, String(v));
    },
    removeItem: (k) => void datos.delete(k),
  };
  return m;
}

// Un mes de club lleno (fixture), guardado en este equipo como la jornada real. Se arma una vez (es grande).
const MES = JSON.stringify(armarMesCargado(HOY_TORNEO, 30));

async function abrirMes(op: { m?: AlmacenamientoLocal; guardado?: GuardadoDelClub; rol?: "OWNER" | "RECEPTION" } = {}) {
  const m = op.m ?? memoria();
  (m as ReturnType<typeof memoria>).datos?.set(CLAVE, MES);
  const a = crearAlmacen({
    reloj: "real",
    clave: CLAVE,
    almacenamiento: m,
    guardado: op.guardado,
    cerrojos: null,
    canal: null,
    temporizador,
    relojMs: () => new Date(2026, 9, 17, 19, 0).getTime(),
    demoraGuardadoMs: 0,
    enReposo: null,
    rol: op.rol ?? "OWNER",
  });
  a.arrancar();
  await vaciar();
  return { a, m: m as ReturnType<typeof memoria> };
}

const preparado = (r: ResultadoDelArchivo | ArchivoPreparado): ArchivoPreparado => {
  assert.ok("confirmar" in r, `se esperaba un archivo para confirmar: ${JSON.stringify(r).slice(0, 200)}`);
  return r;
};

test("archivar lo hace un dueño: rol OWNER del ERP y PIN de un dueño del club (el motor no lo valida)", async () => {
  const { a: recepcion } = await abrirMes({ rol: "RECEPTION" });
  assert.deepEqual(recepcion.prepararArchivo({ auth: DUENIO }), { ok: false, motivo: "Archivar lo hace un dueño." });
  const { a } = await abrirMes();
  assert.deepEqual(a.prepararArchivo({ auth: RECEPCION }), { ok: false, motivo: "Archivar lo hace un dueño." });
  assert.deepEqual(a.prepararArchivo({ auth: { ...DUENIO, pin: "99" } }), { ok: false, motivo: "PIN incorrecto." });
  assert.equal(a.prepararArchivo().ok, false, "en la jornada real, sin operador no archiva nadie");
  // Con el operador del almacén (lo que deja el PIN de la sesión del club) alcanza.
  const duenio = a.estado().usuarios.find((u) => u.id === DUENIO.usuarioId)!;
  a.cambiarOperador(duenio, DUENIO);
  assert.equal(a.prepararArchivo().ok, true);
});

test("preparar no toca nada; confirmar guarda PRIMERO el anexo, después el estado achicado, y apaga «Deshacer»", async () => {
  const { a, m } = await abrirMes();
  assert.equal(a.estadoDelGuardado().lleno, true, `un mes lleno pasa el aviso del vanilla (${AVISO_LLENO.toLocaleString("es-AR")})`);
  // Una acción deshacible antes: después de archivar no se puede deshacer.
  // Un turno de la última semana: el motor nunca la archiva.
  const vivo = a.estado().reservas.find((r) => r.fecha >= M.sumarDias(HOY_TORNEO, -6))!;
  assert.ok(vivo, "el mes trae turnos de la última semana");
  a.ejecutar((e) => (e.log.unshift({ fecha: null, min: null, texto: `toque en ${vivo.id}` }), { ok: true, mensaje: "Listo" }), { deshacible: true });
  assert.equal(a.puedeDeshacer(), true);
  const estadoAntes = a.estado();
  const reservasAntes = estadoAntes.reservas.length;
  const guardadoAntes = m.datos.get(CLAVE);
  const escriturasAntes = m.escrituras.length;

  const p = preparado(a.prepararArchivo({ auth: DUENIO }));
  assert.equal(p.vacio, false);
  assert.equal(p.hasta, M.diaParaArchivar(estadoAntes, a.ahora()));
  assert.ok(p.conteos.reservas > 0 && p.anexo.reservas.length === p.conteos.reservas);
  assert.equal(p.guardaAnexo, false, "el de este equipo no guarda el anexo (ocuparía el lugar que se libera): se descarga");
  assert.equal(a.estado(), estadoAntes, "preparar no toca el estado");
  assert.equal(a.estado().reservas.length, reservasAntes);
  assert.equal(m.escrituras.length, escriturasAntes, "ni escribe");
  assert.ok(p.respaldo.length > 0 && JSON.parse(p.respaldo).estado.reservas.length === reservasAntes, "el respaldo completo de AHORA, para descargar");
  assert.deepEqual(JSON.parse(p.textoAnexo), p.anexo);

  // Sin confirmar la descarga, no se achica nada.
  assert.deepEqual(await p.confirmar(), { ok: false, motivo: "Primero descargá el respaldo y el archivo de esos días: recién después se achica lo guardado." });
  assert.equal(a.estado(), estadoAntes);
  assert.equal(m.escrituras.length, escriturasAntes);
  const r = await p.confirmar({ descargado: true });
  assert.equal(r.ok, true);
  assert.deepEqual(m.escrituras.slice(escriturasAntes), [CLAVE], "sólo el estado achicado: el anexo no se guarda en este equipo");
  const ids = new Set(a.estado().reservas.map((x) => x.id));
  assert.ok(p.anexo.reservas.every((x) => !ids.has(x.id)), "lo archivado salió del estado vivo");
  assert.ok(ids.has(vivo.id), "lo de la última semana sigue");
  assert.equal(a.puedeDeshacer(), false);
  assert.equal(a.aviso()!.deshacer, false);
  assert.match(a.aviso()!.mensaje, /^Archivado hasta el \d+\/\d+: \d+ turnos/);
  assert.ok(r.ok && r.bytesDespues < r.bytesAntes);
  assert.notEqual(m.datos.get(CLAVE), guardadoAntes);
  assert.equal(a.estadoDelGuardado().bytes, separarVersion(m.datos.get(CLAVE)!).texto.length, "bytes = lo que quedó guardado (sin la versión que pega el guardado)");
  assert.equal(a.estadoDelGuardado().lleno, false, "ya no está lleno");
  assert.deepEqual(await p.confirmar(), { ok: false, motivo: "Este archivo ya se usó: prepará otro." }, "se confirma una sola vez");
});

/** Un guardado «de la base» (BP-3) que anota el orden y deja configurar si `guardarAnexo` anda. */
function baseFalsa(anexoAnda: boolean) {
  let alla: { texto: string; version: number } | null = { texto: MES, version: 3 };
  const orden: string[] = [];
  const g: GuardadoDelClub & { orden: string[]; alla: () => typeof alla } = {
    orden,
    alla: () => alla,
    leer: async () => alla,
    guardar: async (texto, esperada): Promise<ResultadoDelGuardado> => {
      orden.push("estado");
      if (alla && alla.version !== esperada) return { ok: false, motivo: "conflicto" };
      alla = { texto, version: esperada + 1 };
      return { ok: true, version: esperada + 1 };
    },
    guardarAnexo: async () => {
      orden.push("anexo");
      return anexoAnda;
    },
  };
  return g;
}

test("con `guardarAnexo` (la base): primero el anexo, después el estado; si el anexo falla, NO se achica nada", async () => {
  const bien = baseFalsa(true);
  const { a } = await abrirMes({ guardado: bien });
  await vaciar();
  const p = preparado(a.prepararArchivo({ auth: DUENIO }));
  assert.equal(p.guardaAnexo, true);
  const r = await p.confirmar(); // no hace falta `descargado`: el anexo quedó a salvo allá
  assert.equal(r.ok, true);
  await vaciar();
  assert.deepEqual(bien.orden, ["anexo", "estado"]);
  assert.ok(bien.alla()!.texto.length < MES.length);

  const mal = baseFalsa(false);
  const { a: b } = await abrirMes({ guardado: mal });
  await vaciar();
  const estadoAntes = b.estado();
  const rr = await b.archivarDiasCerrados({ auth: DUENIO, descargado: true });
  assert.deepEqual(rr, { ok: false, motivo: "No se pudo guardar el archivo de esos días: no se achicó nada. Probá de nuevo." });
  await vaciar();
  assert.equal(b.estado(), estadoAntes);
  assert.deepEqual(mal.orden, ["anexo"], "el estado no se guardó");
  assert.equal(mal.alla()!.texto, MES);
});

test("sin `guardarAnexo` (otro guardado): confirmar exige la descarga; con ella achica y guarda", async () => {
  let guardadoAlla: { texto: string; version: number } | null = { texto: MES, version: 3 };
  const llamadas: string[] = [];
  const remoto: GuardadoDelClub = {
    leer: async () => guardadoAlla,
    guardar: async (texto, esperada): Promise<ResultadoDelGuardado> => {
      llamadas.push(texto);
      if (guardadoAlla && guardadoAlla.version !== esperada) return { ok: false, motivo: "conflicto" };
      guardadoAlla = { texto, version: esperada + 1 };
      return { ok: true, version: esperada + 1 };
    },
  };
  const { a } = await abrirMes({ guardado: remoto });
  await vaciar();
  const p = preparado(a.prepararArchivo({ auth: DUENIO }));
  assert.equal(p.guardaAnexo, false);
  const sin = await p.confirmar();
  assert.deepEqual(sin, { ok: false, motivo: "Primero descargá el respaldo y el archivo de esos días: recién después se achica lo guardado." });
  assert.equal(llamadas.length, 0);
  const r = await p.confirmar({ descargado: true });
  assert.equal(r.ok, true);
  await vaciar();
  assert.equal(llamadas.length, 1, "se guardó el achicado");
  assert.ok(llamadas[0].length < MES.length);
});

test("si el estado cambió entre preparar y confirmar, no se achica (el anexo bajado ya no coincide); vacío no confirma nada", async () => {
  const { a } = await abrirMes();
  const p = preparado(a.prepararArchivo({ auth: DUENIO }));
  a.aplicar((e) => void e.log.unshift({ fecha: null, min: null, texto: "otra cosa" }));
  const antes = a.estado();
  const r = await p.confirmar();
  assert.equal(r.ok, false);
  assert.match((r as { motivo: string }).motivo, /^Cambió algo mientras tanto/);
  assert.equal(a.estado(), antes);
  // La demo del día no tiene días viejos con la caja cerrada: no hay nada que archivar.
  const demo = crearAlmacen({ hoy: HOY_TORNEO, clave: claveDeLaDemo(NEGOCIO, "u1"), almacenamiento: null, rol: "OWNER", demoraGuardadoMs: 0 });
  const v = demo.prepararArchivo({ hasta: M.sumarDias(HOY_TORNEO, -8) });
  assert.equal(v.ok && v.vacio, true);
  assert.equal("confirmar" in v, false);
});

/**
 * MEDICIÓN (PERFORMANCE-TERMINALES.md, «Archivado»): con un mes de club lleno, los caracteres guardados y el costo de
 * ABRIR (JSON.parse + hidratarEstado, lo que paga cada recarga) antes y después; con el corte por defecto (quedan 21
 * días) y con el máximo (quedan 7).
 */
test("medición: bytes y costo de abrir, antes y después de archivar un mes lleno", async (t) => {
  const abrir = (texto: string) => {
    const N = 5;
    for (let i = 0; i < 2; i++) M.hidratarEstado(JSON.parse(texto));
    const t0 = performance.now();
    for (let i = 0; i < N; i++) assert.equal(M.hidratarEstado(JSON.parse(texto)).ok, true);
    return (performance.now() - t0) / N;
  };
  const medir = async (hasta?: (e: M.EstadoClub, ahora: M.Ahora) => string) => {
    const { a, m } = await abrirMes();
    const antes = m.datos.get(CLAVE)!;
    const r = await a.archivarDiasCerrados({ auth: DUENIO, hasta: hasta?.(a.estado(), a.ahora()), descargado: true });
    assert.ok(r.ok && !r.vacio);
    const despues = m.datos.get(CLAVE)!;
    const anexo = JSON.stringify(r.anexo);
    return { antes: antes.length, despues: despues.length, anexo: anexo.length, msAntes: abrir(antes), msDespues: abrir(despues), conteos: r.conteos, hasta: r.hasta };
  };
  const def = await medir();
  const max = await medir((e, ahora) => M.diaParaArchivar(e, ahora, 7));
  const fmt = (x: typeof def) =>
    `hasta ${x.hasta}: ${x.antes.toLocaleString("es-AR")} → ${x.despues.toLocaleString("es-AR")} caracteres (anexo ${x.anexo.toLocaleString("es-AR")}), abrir ${x.msAntes.toFixed(1)} → ${x.msDespues.toFixed(1)} ms, ${x.conteos.reservas} turnos y ${x.conteos.movimientos} movimientos archivados`;
  t.diagnostic(`por defecto (quedan 21 días) · ${fmt(def)}`);
  t.diagnostic(`al máximo (quedan 7 días) · ${fmt(max)}`);
  assert.ok(def.despues < def.antes && max.despues < def.despues);
  assert.ok(def.antes > AVISO_LLENO && max.despues < AVISO_LLENO);
});
