import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { aFormData } from "./campos";
import {
  buscarFichas,
  camposDelAlta,
  conteoPorDia,
  decisionDeLaSenia,
  diasParaElegir,
  faltaLaSenia,
  fichaParecida,
  filtrarPorFranja,
  franjaDeAhora,
  franjasDeHorarios,
  haceCuanto,
  horarioDelHueco,
  horariosDelDia,
  horariosLibres,
  inicioDeLaHora,
  listoDelTurno,
  nombreComparable,
  primerHuecoLibre,
  queFalta,
  queFaltaParaDar,
  serviciosDelNegocio,
  telefonoParaGuardar,
  telefonoRecortado,
  type ProfesionalDelAlta,
} from "./alta-core";
import type { FichaParaAlta } from "@/lib/clientes/ficha-por-telefono";

const ACCIONES = readFileSync(fileURLToPath(new URL("../../../../../lib/actions.ts", import.meta.url)), "utf8");
function camposQueLee(nombre: string): Set<string> {
  const i = ACCIONES.indexOf(`export async function ${nombre}(`);
  const resto = ACCIONES.slice(i + 10);
  const fin = resto.search(/\nexport (async )?function /);
  return new Set([...resto.slice(0, fin).matchAll(/formData\.(?:get|has|getAll)\("([^"]+)"\)/g)].map((m) => m[1]));
}

const svc = (id: string, name: string, price = 20000, depositAmount: number | null = null) => ({ id, name, durationMin: 60, price, residentPrice: null, depositAmount });
const PROFESIONALES: ProfesionalDelAlta[] = [
  { id: "carla", name: "Carla Díaz", box: { name: "Box 3" }, services: [svc("peeling", "Peeling químico", 22000), svc("masaje", "Masaje descontracturante")] },
  { id: "marina", name: "Marina Suárez", box: { name: "Box 2" }, services: [svc("peeling", "Peeling químico", 22000), svc("hidra", "Hidratación facial")] },
];

describe("el alta en el orden de la llamada", () => {
  test("cada servicio una vez, con quién lo hace", () => {
    const s = serviciosDelNegocio(PROFESIONALES);
    assert.deepEqual(
      s.map((x) => [x.name, x.profesionales]),
      [
        ["Hidratación facial", ["marina"]],
        ["Masaje descontracturante", ["carla"]],
        ["Peeling químico", ["carla", "marina"]],
      ],
    );
  });

  test("los horarios de todas juntos, cada hora una vez y con quién está libre", () => {
    const h = horariosLibres(
      { carla: ["2026-09-25T18:00:00.000Z", "2026-09-25T19:00:00.000Z"], marina: ["2026-09-25T13:00:00.000Z", "2026-09-25T18:00:00.000Z"] },
      ["carla", "marina"],
    );
    assert.deepEqual(h, [
      { inicio: "2026-09-25T13:00:00.000Z", profesionales: ["marina"] },
      { inicio: "2026-09-25T18:00:00.000Z", profesionales: ["carla", "marina"] },
      { inicio: "2026-09-25T19:00:00.000Z", profesionales: ["carla"] },
    ]);
  });

  test("días para elegir con un toque, hoy incluido", () => {
    assert.deepEqual(diasParaElegir("2026-09-30", 3), ["2026-09-30", "2026-10-01", "2026-10-02"]);
  });

  test("qué falta, dicho en el orden de la llamada", () => {
    assert.equal(queFalta({ nombre: "", telefono: "", servicioId: "", inicio: "", profesionalId: "" }), "Falta quién: el nombre y el teléfono.");
    assert.equal(queFalta({ nombre: "Camila", telefono: "11 5555-0101", servicioId: "", inicio: "", profesionalId: "" }), "Falta qué servicio.");
    assert.equal(queFalta({ nombre: "Camila", telefono: "1", servicioId: "p", inicio: "x", profesionalId: "c" }), null);
  });
});

describe("lo que viaja es lo que lee createManualAppointment", () => {
  const base = {
    profesionalId: "carla",
    servicioId: "peeling",
    inicio: "2026-09-25T18:00:00.000Z",
    nombre: " Camila Ortiz ",
    telefono: "11 5555-0101",
    deLaZona: true,
    cupon: " VERANO ",
    estado: "PENDING" as const,
    notas: "Piel sensible",
  };

  test("con cobro y de la zona: todos los campos, con los nombres de siempre", () => {
    const c = camposDelAlta({ ...base, cobro: { monto: 5000, metodo: "TRANSFERENCIA" } });
    const lee = camposQueLee("createManualAppointment");
    for (const [k] of c) assert.ok(lee.has(k), `createManualAppointment no lee ${k}`);
    assert.deepEqual(new Set(c.map(([k]) => k)), lee);
    const fd = aFormData(c);
    assert.equal(fd.get("isResident"), "on");
    assert.equal(fd.get("senaCobrar"), "on");
    assert.equal(fd.get("senaMonto"), "5000");
    assert.equal(fd.get("clientName"), "Camila Ortiz");
    assert.equal(fd.get("couponCode"), "VERANO");
  });

  test("sin cobro ni zona: no viajan (como el checkbox y el bloque de cobro de siempre)", () => {
    const fd = aFormData(camposDelAlta({ ...base, deLaZona: false, cobro: null }));
    assert.equal(fd.get("isResident"), null);
    assert.equal(fd.get("senaCobrar"), null);
    assert.equal(fd.get("senaMonto"), null);
    assert.equal(fd.get("status"), "PENDING");
  });
});

describe("los horarios libres del alta, en renglones por franja", () => {
  const hora = (inicio: string) => inicio.slice(11, 16);
  const h = (hhmm: string) => ({ inicio: `2026-09-26T${hhmm}:00.000`, profesionales: ["p1"] });

  test("parte en mañana, tarde y noche con los cortes a las 13 y a las 19", () => {
    const f = franjasDeHorarios([h("09:00"), h("12:30"), h("13:00"), h("18:30"), h("19:00")], hora);
    assert.deepEqual(
      f.map((x) => [x.franja, x.horarios.map((y) => hora(y.inicio))]),
      [
        ["De mañana", ["09:00", "12:30"]],
        ["De tarde", ["13:00", "18:30"]],
        ["De noche", ["19:00"]],
      ],
    );
  });

  test("no dibuja una franja sin horarios", () => {
    assert.deepEqual(franjasDeHorarios([h("15:00")], hora).map((x) => x.franja), ["De tarde"]);
    assert.deepEqual(franjasDeHorarios([], hora), []);
  });

  test("usa la hora que se ve en el botón, no la del reloj de la máquina", () => {
    // Un turno 15:00 UTC es 12:00 en Buenos Aires: si el botón dice 12:00, va a la mañana.
    const f = franjasDeHorarios([{ inicio: "2026-09-26T15:00:00.000Z" }], () => "12:00");
    assert.equal(f[0].franja, "De mañana");
  });
});

// ── Reingeniería CH · Tanda 2 ────────────────────────────────────────────────

// Sábado 24/10/2026 en Buenos Aires (UTC−3): 16:00 = 19:00Z.
const iso = (dia: string, hhmm: string) => inicioDeLaHora(dia, hhmm);
const HUECOS = {
  caro: { "2026-10-24": [iso("2026-10-24", "10:00")], "2026-10-25": [] },
  lu: { "2026-10-24": [iso("2026-10-24", "10:00"), iso("2026-10-24", "14:00"), iso("2026-10-24", "16:00")], "2026-10-25": [iso("2026-10-25", "09:00")] },
};
const hora = (i: string) => new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(i));

describe("cuándo: 7 días con cuántos huecos (CH-018)", () => {
  test("la hora de pared del negocio pasa a UTC", () => {
    assert.equal(inicioDeLaHora("2026-10-24", "16:00"), "2026-10-24T19:00:00.000Z");
    assert.equal(inicioDeLaHora("2026-10-24", "nada"), "");
  });

  test("cada día cuenta los horarios distintos de todas las que lo hacen", () => {
    assert.deepEqual(conteoPorDia(HUECOS, ["caro", "lu"], ["2026-10-23", "2026-10-24", "2026-10-25"]), {
      "2026-10-23": 0,
      "2026-10-24": 3,
      "2026-10-25": 1,
    });
  });

  test("Caro llena a la tarde y Lu libre: en «de tarde» aparecen sólo los de Lu", () => {
    const dia = horariosDelDia(HUECOS, ["caro", "lu"], "2026-10-24");
    const tarde = filtrarPorFranja(dia, "De tarde", hora);
    assert.deepEqual(tarde.map((h) => [hora(h.inicio), h.profesionales]), [
      ["14:00", ["lu"]],
      ["16:00", ["lu"]],
    ]);
    assert.equal(filtrarPorFranja(dia, null, hora).length, 3);
    assert.deepEqual(filtrarPorFranja(dia, "De noche", hora), []);
  });

  test("el primer hueco libre salta los días sin lugar", () => {
    assert.deepEqual(primerHuecoLibre(HUECOS, ["caro", "lu"], ["2026-10-23", "2026-10-24"]), {
      dia: "2026-10-24",
      horario: { inicio: iso("2026-10-24", "10:00"), profesionales: ["caro", "lu"] },
    });
    assert.equal(primerHuecoLibre(HUECOS, ["caro"], ["2026-10-25"]), null);
  });
});

describe("el hueco tocado y «atender ahora»", () => {
  const dia = horariosDelDia(HUECOS, ["caro", "lu"], "2026-10-24");
  test("el hueco tocado se elige solo con su profesional (CH-029)", () => {
    assert.deepEqual(horarioDelHueco(dia, iso("2026-10-24", "14:00"), "lu"), { inicio: iso("2026-10-24", "14:00"), profesionalId: "lu" });
    assert.deepEqual(horarioDelHueco(dia, iso("2026-10-24", "10:00"), "caro"), { inicio: iso("2026-10-24", "10:00"), profesionalId: "caro" });
  });
  test("si el servicio no entra en ese hueco (o la profesional no está libre), no se elige nada", () => {
    assert.equal(horarioDelHueco(dia, iso("2026-10-24", "14:00"), "caro"), null);
    assert.equal(horarioDelHueco(dia, iso("2026-10-24", "11:00"), "lu"), null);
    assert.equal(horarioDelHueco(dia, "", "lu"), null);
  });
  test("a las 11:05 la franja de ahora es la de las 11:00 (CH-019)", () => {
    assert.equal(franjaDeAhora(new Date("2026-10-24T14:05:00.000Z")), "2026-10-24T14:00:00.000Z");
    assert.equal(franjaDeAhora(new Date("2026-10-24T14:30:00.000Z")), "2026-10-24T14:30:00.000Z");
    assert.equal(franjaDeAhora(new Date("2026-10-24T14:59:59.000Z")), "2026-10-24T14:30:00.000Z");
  });
});

const ficha = (id: string, nombre: string, telefono: string, turnos = 1): FichaParaAlta => ({
  id,
  nombre,
  telefono,
  notas: null,
  vecina: null,
  turnos,
  creada: "2026-01-01T00:00:00.000Z",
  ultimaVisita: null,
  saldo: 0,
});
const FICHAS = [ficha("l", "Laura Gómez", "11 5566-7788", 8), ficha("l2", "Laura Pérez", "11 4000-1111", 2), ficha("m", "Mariana Ruiz", "11 2222-3333")];

describe("quién: un solo campo (CH-020)", () => {
  test("busca por nombre sin tildes y por parte del teléfono", () => {
    assert.equal(nombreComparable("  Laura   GÓMEZ "), "laura gomez");
    assert.deepEqual(buscarFichas(FICHAS, "laura").map((f) => f.id), ["l", "l2"], "las dos, la de más turnos primero");
    assert.deepEqual(buscarFichas(FICHAS, "gomez").map((f) => f.id), ["l"]);
    assert.deepEqual(buscarFichas(FICHAS, "5566").map((f) => f.id), ["l"]);
    assert.deepEqual(buscarFichas(FICHAS, "011 15 5566 7788").map((f) => f.id), ["l"]);
    assert.deepEqual(buscarFichas(FICHAS, "martina ruiz"), []);
    assert.deepEqual(buscarFichas(FICHAS, "  "), []);
  });

  test("«Laura Gomez» con otro número: ¿es Laura Gómez?", () => {
    assert.equal(fichaParecida(FICHAS, "Laura Gomez", "11 9999-0000")?.id, "l");
    assert.equal(fichaParecida(FICHAS, "gómez laura", "")?.id, "l", "mismas palabras en otro orden");
    assert.equal(fichaParecida(FICHAS, "Laura Gomez", "1155667788"), null, "mismo número: es ella, no un parecido");
    assert.equal(fichaParecida(FICHAS, "Laura", "11 9999-0000"), null, "con un solo nombre hay demasiadas");
    assert.equal(fichaParecida(FICHAS, "Martina Ruiz", "11 2345 6789"), null);
  });

  test("el teléfono de una clienta nueva se guarda normalizado; el aviso lo recorta", () => {
    assert.equal(telefonoParaGuardar("11 2345 6789"), "1123456789");
    assert.equal(telefonoParaGuardar("+54 9 11 2345-6789"), "1123456789");
    assert.equal(telefonoParaGuardar(" 4567 "), "4567");
    assert.equal(telefonoRecortado("11 5566-7788"), "11 5566…");
    assert.equal(telefonoRecortado("0221 455-1234"), "221 4551…");
  });
});

describe("la seña en tres teclas (CH-017, CH-021)", () => {
  test("«Ya la mandó»: cobra la seña por transferencia y confirma", () => {
    assert.deepEqual(decisionDeLaSenia({ senia: 5000, eleccion: "ya", medio: "TRANSFERENCIA", puedeCobrar: true }), {
      cobro: { monto: 5000, metodo: "TRANSFERENCIA" },
      estado: "CONFIRMED",
      pedirSenia: false,
    });
  });
  test("«Pedírsela»: no cobra, queda Reservado y con la marca de pedida", () => {
    assert.deepEqual(decisionDeLaSenia({ senia: 5000, eleccion: "pedir", medio: null, puedeCobrar: true }), { cobro: null, estado: "PENDING", pedirSenia: true });
  });
  test("«Sin seña»: Reservado, salvo que se marque «ya confirmó»", () => {
    assert.deepEqual(decisionDeLaSenia({ senia: 5000, eleccion: "sin", medio: null, puedeCobrar: true }), { cobro: null, estado: "PENDING", pedirSenia: false });
    assert.equal(decisionDeLaSenia({ senia: 5000, eleccion: "sin", medio: null, puedeCobrar: true, yaConfirmo: true }).estado, "CONFIRMED");
  });
  test("quien no le cobra a esa profesional (Vero) no registra la seña aunque elija «ya»", () => {
    assert.deepEqual(decisionDeLaSenia({ senia: 5000, eleccion: "ya", medio: "TRANSFERENCIA", puedeCobrar: false }), { cobro: null, estado: "PENDING", pedirSenia: false });
  });
  test("falta elegir la seña sólo si el servicio la pide", () => {
    assert.match(faltaLaSenia(5000, null) ?? "", /Falta la seña/);
    assert.equal(faltaLaSenia(5000, "sin"), null);
    assert.equal(faltaLaSenia(0, null), null);
  });
  test("lo que viaja con «Ya la mandó» es lo que lee createManualAppointment", () => {
    const d = decisionDeLaSenia({ senia: 5000, eleccion: "ya", medio: "TRANSFERENCIA", puedeCobrar: true });
    const fd = aFormData(
      camposDelAlta({ profesionalId: "caro", servicioId: "piernas", inicio: iso("2026-10-24", "16:00"), nombre: "Laura Gómez", telefono: "11 5566-7788", deLaZona: false, cupon: "", cobro: d.cobro, estado: d.estado, notas: "" }),
    );
    assert.equal(fd.get("senaCobrar"), "on");
    assert.equal(fd.get("senaMonto"), "5000");
    assert.equal(fd.get("senaMetodo"), "TRANSFERENCIA");
    assert.equal(fd.get("status"), "CONFIRMED");
  });
});

describe("Listo ✓ con el WhatsApp armado", () => {
  const base = {
    clienta: "Laura Gómez",
    telefono: "11 5566-7788",
    servicio: "Piernas completas",
    durationMin: 30,
    inicio: iso("2026-10-24", "16:00"),
    profesional: "Caro",
    precio: 14000,
    senia: 5000,
    medio: "TRANSFERENCIA" as const,
  };
  test("con seña recibida: Confirmado, falta $9.000 y la confirmación con la seña (CH-017)", () => {
    const l = listoDelTurno({ ...base, eleccion: "ya", cobrada: true });
    assert.equal(l.estado, "Confirmado · seña $5.000 por transferencia · falta $9.000");
    assert.equal(l.tecla, "Mandar confirmación por WhatsApp");
    assert.ok(l.wa?.startsWith("https://wa.me/5491155667788?text="));
    const texto = decodeURIComponent(l.wa!.split("?text=")[1]);
    assert.match(texto, /24 a las 16:00/);
    assert.match(texto, /con Caro/);
    assert.match(texto, /seña de \$5\.000/);
  });
  test("con seña pedida: la tecla manda el pedido con monto y alias (CH-021)", () => {
    const l = listoDelTurno({ ...base, eleccion: "pedir", medio: null, cobrada: false, alias: "ch.mp" });
    assert.equal(l.estado, "Reservado · seña de $5.000 pedida");
    assert.equal(l.tecla, "Pedirle la seña por WhatsApp");
    assert.match(l.texto, /seña de \$5\.000 al alias \*ch\.mp\*/);
  });
  test("sin seña: Reservado y la confirmación sin nombrar plata; sin celular no hay link", () => {
    const l = listoDelTurno({ ...base, eleccion: "sin", medio: null, cobrada: false, telefono: "4567" });
    assert.equal(l.estado, "Reservado · sin seña");
    assert.doesNotMatch(l.texto, /seña|\$/);
    assert.equal(l.wa, null);
  });
  test("una seña elegida pero que el servidor no cobró (Vero) no se anuncia como recibida", () => {
    const l = listoDelTurno({ ...base, eleccion: "ya", cobrada: false });
    assert.doesNotMatch(l.texto, /Recibimos/);
  });
});

describe("qué falta, en el orden de la pantalla nueva", () => {
  const listo = { servicioId: "s", inicio: "x", profesionalId: "p", nombre: "Laura", telefono: "11", senia: 5000, eleccion: "ya" as const };
  test("de arriba para abajo", () => {
    assert.equal(queFaltaParaDar({ ...listo, servicioId: "" }), "Falta qué servicio.");
    assert.equal(queFaltaParaDar({ ...listo, inicio: "" }), "Falta el día y la hora.");
    assert.equal(queFaltaParaDar({ ...listo, profesionalId: "" }), "Falta con quién.");
    assert.equal(queFaltaParaDar({ ...listo, telefono: " " }), "Falta quién: el nombre y el teléfono.");
    assert.match(queFaltaParaDar({ ...listo, eleccion: null }) ?? "", /Falta la seña/);
    assert.equal(queFaltaParaDar(listo), null);
    assert.equal(queFaltaParaDar({ ...listo, senia: 0, eleccion: null }), null);
  });
  test("hace cuánto vino", () => {
    assert.equal(haceCuanto("2026-09-20T15:00:00.000Z", "2026-10-22"), "hace 32 días");
    assert.equal(haceCuanto("2026-10-21T15:00:00.000Z", "2026-10-22"), "ayer");
    assert.equal(haceCuanto("2026-10-22T15:00:00.000Z", "2026-10-22"), "hoy");
    assert.equal(haceCuanto("nada", "2026-10-22"), "");
  });
});
