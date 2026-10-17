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
  assert.deepEqual(recepcion.prepararArchivo({ auth: DUENIO }), { ok: false, causa: "permiso", motivo: "Archivar lo hace un dueño." });
  const { a } = await abrirMes();
  assert.deepEqual(a.prepararArchivo({ auth: RECEPCION }), { ok: false, causa: "permiso", motivo: "Archivar lo hace un dueño." });
  assert.deepEqual(a.prepararArchivo({ auth: { ...DUENIO, pin: "99" } }), { ok: false, causa: "permiso", motivo: "PIN incorrecto." });
  assert.equal(a.prepararArchivo().ok, false, "en la jornada real, sin operador no archiva nadie");
  // Con el operador del almacén (lo que deja el PIN de la sesión del club) alcanza.
  const duenio = a.estado().usuarios.find((u) => u.id === DUENIO.usuarioId)!;
  a.cambiarOperador(duenio, DUENIO);
  assert.equal(a.prepararArchivo().ok, true);
});

test("preparar no toca nada y da UN archivo; con ese archivo elegido se achica, y «Deshacer» queda apagado", async () => {
  const { a, m } = await abrirMes();
  assert.equal(a.estadoDelGuardado().lleno, true, `un mes lleno pasa el aviso del vanilla (${AVISO_LLENO.toLocaleString("es-AR")})`);
  // Una acción deshacible antes (sobre un turno de la última semana, que el motor nunca archiva).
  const vivo = a.estado().reservas.find((r) => r.fecha >= M.sumarDias(HOY_TORNEO, -6))!;
  assert.ok(vivo, "el mes trae turnos de la última semana");
  a.cambiarOperador(a.estado().usuarios.find((u) => u.id === DUENIO.usuarioId)!, DUENIO);
  a.ejecutar((e) => (e.log.unshift({ fecha: null, min: null, texto: `toque en ${vivo.id}` }), { ok: true, mensaje: "Listo" }), { deshacible: true });
  assert.equal(a.puedeDeshacer(), true);
  const estadoAntes = a.estado();
  const reservasAntes = estadoAntes.reservas.length;
  const escriturasAntes = m.escrituras.length;

  const p = preparado(a.prepararArchivo({ auth: DUENIO }));
  assert.equal(p.hasta, M.diaParaArchivar(estadoAntes, a.ahora()));
  assert.ok(p.conteos.reservas > 0 && p.anexo.reservas.length === p.conteos.reservas);
  assert.equal(p.guardaAnexo, false, "el de este equipo no guarda el anexo: va en el archivo");
  assert.equal(a.estado(), estadoAntes, "preparar no toca el estado");
  assert.equal(m.escrituras.length, escriturasAntes, "ni escribe");
  const archivo = JSON.parse(p.textoDelArchivo) as M.PaqueteArchivo;
  assert.equal(archivo.tipo, "respaldo-y-archivo");
  assert.equal(archivo.huella, p.huella);
  assert.equal(archivo.respaldo.estado.reservas.length, reservasAntes, "el respaldo completo de AHORA va adentro");
  assert.deepEqual(archivo.anexo, p.anexo);

  // Sin el archivo elegido, no se achica.
  assert.equal((await p.confirmar()).ok, false);
  assert.equal(a.estado(), estadoAntes);
  const r = await p.confirmar({ archivoElegido: p.textoDelArchivo });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
  assert.deepEqual(m.escrituras.slice(escriturasAntes), [CLAVE], "sólo el estado achicado: el anexo no se guarda en este equipo");
  const ids = new Set(a.estado().reservas.map((x) => x.id));
  assert.ok(p.anexo.reservas.every((x) => !ids.has(x.id)), "lo archivado salió del estado vivo");
  assert.ok(ids.has(vivo.id), "lo de la última semana sigue");
  assert.equal(a.puedeDeshacer(), false);
  assert.equal(a.aviso()!.deshacer, false);
  assert.match(a.aviso()!.mensaje, /^Archivado hasta el \d+\/\d+: \d+ turnos/);
  assert.ok(r.ok && r.bytesDespues < r.bytesAntes);
  assert.equal(a.estadoDelGuardado().bytes, separarVersion(m.datos.get(CLAVE)!).texto.length, "bytes = lo que quedó guardado (sin la versión que pega el guardado)");
  assert.equal(a.estadoDelGuardado().lleno, false, "ya no está lleno");
});

test("el archivo elegido: de otro corte o de otro club → «otro»; alterado (anexo o respaldo) o cortado → «danado»; nada se achica", async () => {
  const { a } = await abrirMes();
  const estadoAntes = a.estado();
  // Otro corte: el archivo descargado para archivar hasta otro día.
  const otroCorte = preparado(a.prepararArchivo({ auth: DUENIO, hasta: M.diaParaArchivar(estadoAntes, a.ahora(), 7) })).textoDelArchivo;
  const p = preparado(a.prepararArchivo({ auth: DUENIO }));
  const causa = async (texto: string) => {
    const r = await p.confirmar({ archivoElegido: texto });
    assert.equal(r.ok, false);
    return r.ok ? null : r.causa;
  };
  assert.equal(await causa(otroCorte), "otro");
  // Otro club (otra jornada): su archivo, armado con el motor sobre otro estado.
  const otro = M.hidratarEstado(JSON.parse(JSON.stringify(armarMesCargado(HOY_TORNEO, 25)))) as { ok: true; estado: M.EstadoClub };
  const resOtro = M.archivarDiasCerrados(otro.estado, p.hasta) as Parameters<typeof M.paqueteParaArchivar>[1];
  assert.equal(await causa(JSON.stringify(M.paqueteParaArchivar({ v: 1, estado: otro.estado, secuencia: 1 }, resOtro))), "otro");
  // Alterado: un peso del anexo, o un nombre del respaldo.
  const tocar = (f: (x: M.PaqueteArchivo) => void) => {
    const x = JSON.parse(p.textoDelArchivo) as M.PaqueteArchivo;
    f(x);
    return JSON.stringify(x);
  };
  assert.equal(await causa(tocar((x) => void (x.anexo.reservas[0].precio += 1))), "danado");
  assert.equal(await causa(tocar((x) => void (x.respaldo.estado.reservas[0].titular += "x"))), "danado");
  // Cortado (la descarga no terminó) o vacío.
  const r = await p.confirmar({ archivoElegido: p.textoDelArchivo.slice(0, -40) });
  assert.deepEqual(r, { ok: false, causa: "danado", motivo: "El archivo está incompleto o dañado: descargalo de nuevo." });
  assert.equal(await causa(""), "danado");
  assert.equal(a.estado(), estadoAntes, "nada se achicó");
  // Y con el bueno, sí (el pendiente sigue después de elegir mal).
  assert.equal((await p.confirmar({ archivoElegido: p.textoDelArchivo })).ok, true);
});

test("si cambió algo de esos días entre preparar y confirmar → «cambio» (descargar de nuevo) y no se achica; algo de hoy no molesta", async () => {
  const { a } = await abrirMes();
  // Algo de HOY (fuera de lo que se archiva) no cambia el archivo: confirma igual y lo de hoy queda.
  const p1 = preparado(a.prepararArchivo({ auth: DUENIO }));
  a.aplicar((e) => void e.log.unshift({ fecha: HOY_TORNEO, min: 1150, texto: "algo de hoy" }));
  const r1 = await p1.confirmar({ archivoElegido: p1.textoDelArchivo });
  assert.equal(r1.ok, true);
  assert.ok(a.estado().log.some((l) => l.texto === "algo de hoy"), "lo de hoy quedó");

  const { a: b } = await abrirMes();
  const p = preparado(b.prepararArchivo({ auth: DUENIO }));
  const id = p.anexo.reservas[0].id;
  b.aplicar((e) => void (e.reservas.find((x) => x.id === id)!.titular = "Cambiado después"));
  const antes = b.estado();
  const r = await p.confirmar({ archivoElegido: p.textoDelArchivo });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.causa, "cambio");
  assert.match(!r.ok ? r.motivo : "", /descargá el archivo de nuevo/);
  assert.equal(b.estado(), antes);
  // Ese archivo ya no sirve: hay que preparar (y descargar) de nuevo.
  assert.equal((await p.confirmar({ archivoElegido: p.textoDelArchivo })).ok, false);
});

test("doble confirmar (doble clic): se achica una sola vez; el segundo sale en silencio", async () => {
  const { a, m } = await abrirMes();
  const p = preparado(a.prepararArchivo({ auth: DUENIO }));
  const antes = m.escrituras.length;
  const [r1, r2] = await Promise.all([p.confirmar({ archivoElegido: p.textoDelArchivo }), p.confirmar({ archivoElegido: p.textoDelArchivo })]);
  assert.equal(r1.ok, true);
  assert.deepEqual(r2, { ok: false, causa: "repetido", motivo: "" });
  assert.equal(m.escrituras.length - antes, 1);
  assert.deepEqual(await p.confirmar({ archivoElegido: p.textoDelArchivo }), { ok: false, causa: "repetido", motivo: "" });
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
      await vaciar();
      return anexoAnda;
    },
  };
  return g;
}

test("con `guardarAnexo` (la base): sin archivo; primero el anexo, después el estado; si falla no se achica; doble clic, una vez", async () => {
  const bien = baseFalsa(true);
  const { a } = await abrirMes({ guardado: bien });
  await vaciar();
  const p = preparado(a.prepararArchivo({ auth: DUENIO }));
  assert.equal(p.guardaAnexo, true);
  const [r, otra] = await Promise.all([p.confirmar(), p.confirmar()]);
  assert.equal(r.ok, true);
  assert.deepEqual(otra, { ok: false, causa: "repetido", motivo: "" });
  await vaciar();
  assert.deepEqual(bien.orden, ["anexo", "estado"], "el anexo una sola vez, y antes que el estado");
  assert.ok(bien.alla()!.texto.length < MES.length);

  const mal = baseFalsa(false);
  const { a: b } = await abrirMes({ guardado: mal });
  await vaciar();
  const estadoAntes = b.estado();
  const rr = await b.archivarDiasCerrados({ auth: DUENIO });
  assert.deepEqual(rr, { ok: false, causa: "guardado", motivo: "No se pudo guardar el archivo de esos días: no se achicó nada. Probá de nuevo." });
  await vaciar();
  assert.equal(b.estado(), estadoAntes);
  assert.deepEqual(mal.orden, ["anexo"], "el estado no se guardó");
  assert.equal(mal.alla()!.texto, MES);
});

test("vacío: si no hay nada para archivar, no hay nada que confirmar", () => {
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
    const p = preparado(a.prepararArchivo({ auth: DUENIO, hasta: hasta?.(a.estado(), a.ahora()) }));
    const t0 = performance.now();
    const r = await p.confirmar({ archivoElegido: p.textoDelArchivo });
    const msVerificar = performance.now() - t0;
    assert.ok(r.ok && !r.vacio);
    const despues = m.datos.get(CLAVE)!;
    const anexo = JSON.stringify(r.anexo);
    return { antes: antes.length, despues: despues.length, anexo: anexo.length, archivo: p.textoDelArchivo.length, msVerificar, msAntes: abrir(antes), msDespues: abrir(despues), conteos: r.conteos, hasta: r.hasta };
  };
  const def = await medir();
  const max = await medir((e, ahora) => M.diaParaArchivar(e, ahora, 7));
  const fmt = (x: typeof def) =>
    `hasta ${x.hasta}: ${x.antes.toLocaleString("es-AR")} → ${x.despues.toLocaleString("es-AR")} caracteres (anexo ${x.anexo.toLocaleString("es-AR")}, archivo ${x.archivo.toLocaleString("es-AR")}, confirmar y verificar ${x.msVerificar.toFixed(0)} ms), abrir ${x.msAntes.toFixed(1)} → ${x.msDespues.toFixed(1)} ms, ${x.conteos.reservas} turnos y ${x.conteos.movimientos} movimientos archivados`;
  t.diagnostic(`por defecto (quedan 21 días) · ${fmt(def)}`);
  t.diagnostic(`al máximo (quedan 7 días) · ${fmt(max)}`);
  assert.ok(def.despues < def.antes && max.despues < def.despues);
  assert.ok(def.antes > AVISO_LLENO && max.despues < AVISO_LLENO);
});
