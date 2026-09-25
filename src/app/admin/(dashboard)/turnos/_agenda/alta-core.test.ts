import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { aFormData } from "./campos";
import { camposDelAlta, diasParaElegir, franjasDeHorarios, horariosLibres, queFalta, serviciosDelNegocio, type ProfesionalDelAlta } from "./alta-core";

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
