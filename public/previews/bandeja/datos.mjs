import { sumarDias } from "./motor.mjs";

// Datos de EJEMPLO de la demo de Bandeja. Profes, clubes y reseñas son inventados: ninguno es una persona
// ni un complejo real. Las localidades y sus coordenadas sí son las de zona sur del AMBA.
// Ningún profe real aparece hasta que firme su autorización (ADR-034).

// La demo vive en el día de quien la abre: las reseñas y la clase de ejemplo se fechan desde hoy.
const ahora = new Date();
const dosCifras = (n) => String(n).padStart(2, "0");
export const HOY = `${ahora.getFullYear()}-${dosCifras(ahora.getMonth() + 1)}-${dosCifras(ahora.getDate())}`;
export const AHORA = { fecha: HOY, min: ahora.getHours() * 60 + ahora.getMinutes() };

/** Desde dónde puede buscar el jugador (centro aproximado de cada localidad). */
export const PUNTOS = [
  { id: "ezeiza", nombre: "Ezeiza", lat: -34.8537, lng: -58.5228 },
  { id: "canning", nombre: "Canning", lat: -34.8705, lng: -58.5089 },
  { id: "monte-grande", nombre: "Monte Grande", lat: -34.8189, lng: -58.4686 },
  { id: "luis-guillon", nombre: "Luis Guillón", lat: -34.8013, lng: -58.4481 },
  { id: "tristan-suarez", nombre: "Tristán Suárez", lat: -34.8868, lng: -58.5636 },
  { id: "lomas", nombre: "Lomas de Zamora", lat: -34.7609, lng: -58.4063 },
  { id: "banfield", nombre: "Banfield", lat: -34.7442, lng: -58.397 },
  { id: "temperley", nombre: "Temperley", lat: -34.7764, lng: -58.3958 },
  { id: "adrogue", nombre: "Adrogué", lat: -34.8007, lng: -58.3903 },
  { id: "burzaco", nombre: "Burzaco", lat: -34.8277, lng: -58.3938 },
];

const P = Object.fromEntries(PUNTOS.map((p) => [p.id, p]));
// Un club de ejemplo cerca del centro de la localidad (corrimiento chico para que no caigan encima).
// El nombre lleva «(ejemplo)» para que nadie lo confunda con un complejo real de la zona.
const club = (nombre, loc, dLat = 0, dLng = 0) => ({
  club: `${nombre} (ejemplo)`,
  localidad: P[loc].nombre,
  lat: +(P[loc].lat + dLat).toFixed(4),
  lng: +(P[loc].lng + dLng).toFixed(4),
});

// Franjas semanales típicas (0 = domingo … 6 = sábado).
const SEMANA_MANANA_TARDE = [1, 2, 3, 4, 5].flatMap((dia) => [
  { dia, desde: "08:00", hasta: "12:00" },
  { dia, desde: "17:00", hasta: "21:00" },
]);
const TARDES = [1, 2, 3, 4, 5].map((dia) => ({ dia, desde: "16:00", hasta: "22:00" }));
const FINDE = [
  { dia: 6, desde: "09:00", hasta: "13:00" },
  { dia: 0, desde: "09:00", hasta: "12:00" },
];

// ── Reseñas de ejemplo: generadas con una semilla fija, así la demo sale igual cada vez ────────────────

function semilla(n) {
  let s = n >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOMBRES = [
  "Juan P.", "Caro M.", "Nico R.", "Flor G.", "Seba L.", "Agus T.", "Vale S.", "Lucas D.", "Meli F.", "Tomi B.",
  "Sofi A.", "Fede C.", "Romi V.", "Gaby N.", "Pato Q.", "Euge H.", "Martín O.", "Lu K.", "Diego Z.", "Cami E.",
  "Ramiro I.", "Belu J.", "Santi U.", "Mica Y.", "Hernán W.", "Pili X.", "Joaco P.", "Ana L.", "Fran M.", "Dani S.",
];

const TEXTOS_BUENOS = [
  "Me corrigió la bandeja en dos clases. Explica simple y te hace repetir hasta que sale.",
  "Arranqué de cero y a los dos meses ya juego partidos con amigos sin pasar vergüenza.",
  "Siempre puntual, con canasto de pelotas y la clase armada. Se nota que la prepara.",
  "Muy buena onda, no te hace sentir mal cuando errás. Ideal para empezar.",
  "Trabajamos salida de pared toda la clase. Al fin entendí dónde pararme.",
  "Le pedí algo para el torneo del finde y me armó una clase de estrategia. Llegamos a semis.",
  "Clase grupal bien pensada: los cuatro jugamos todo el tiempo, nadie se queda mirando.",
  "Le mando el video del partido y en la clase siguiente trabajamos eso. Un lujo.",
  "Mi hijo de 11 va los martes y vuelve feliz. Paciencia infinita con los chicos.",
  "Me cambió el agarre y dejé de tener dolor de codo.",
  "Muy claro con la técnica de la víbora. Se toma el tiempo de explicar el porqué.",
  "Reservo desde el link, le paso el comprobante y listo. Cero idas y vueltas.",
];
const TEXTOS_MEDIOS = [
  "Sabe mucho, pero a veces la clase arranca 10 minutos tarde.",
  "Buena clase. Me hubiera gustado más trabajo de volea y menos de fondo.",
  "Correcto. Para mi nivel le falta un poco más de exigencia.",
  "Explica bien, aunque en grupal le cuesta repartir la atención.",
];

function resenasDe(id, cantidad, media, rnd) {
  const out = [];
  const clamp = (x) => Math.max(1, Math.min(5, Math.round(x)));
  for (let i = 0; i < cantidad; i++) {
    const tirada = () => clamp(media + (rnd() - 0.45) * 1.6);
    const puntos = { ensena: tirada(), progreso: tirada(), puntualidad: tirada(), trato: tirada() };
    const prom = (puntos.ensena + puntos.progreso + puntos.puntualidad + puntos.trato) / 4;
    const pool = prom >= 4.25 ? TEXTOS_BUENOS : TEXTOS_MEDIOS;
    const diasAtras = Math.floor(rnd() * 160) + 1;
    const d = new Date(`${HOY}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - diasAtras);
    const fecha = d.toISOString().slice(0, 10);
    out.push({
      id: `${id}-r${i}`,
      // En los profes con muchas reseñas, los dos últimos alumnos repiten: el motor cuenta sólo su última
      // reseña (una voz por alumno).
      alumnoId: cantidad > 8 && i >= cantidad - 2 ? `${id}-a${i - (cantidad - 2)}` : `${id}-a${i}`,
      alumno: NOMBRES[(i * 7 + id.length) % NOMBRES.length],
      fecha,
      fechaClase: fecha,
      puntos,
      texto: rnd() < 0.8 ? pool[Math.floor(rnd() * pool.length)] : "",
      verificada: true,
    });
    // Derecho a réplica: el profe contesta en público, no borra.
    if (pool === TEXTOS_MEDIOS && out.at(-1).texto) out.at(-1).respuesta = RESPUESTAS[i % RESPUESTAS.length];
  }
  return out;
}

const RESPUESTAS = [
  "Gracias por decirlo. Ya cambié el arranque: la clase empieza en hora aunque falte alguien del grupo.",
  "¡Gracias! La próxima armamos media clase de red, avisame qué querés trabajar.",
  "Tenés razón, para tu nivel te conviene el grupo de avanzados. Te paso los horarios.",
];

// ── Profes de ejemplo ─────────────────────────────────────────────────────────────────────────────────

const BASE = [
  {
    id: "lucia-ferreyra", nombre: "Lucía Ferreyra", desde: 2016, juega: "Juega en 3ra",
    bio: "Profesora con certificación de la asociación y diez años en la cancha. Me especializo en gente que arranca y en damas que quieren pasar de 7ma a 6ta.",
    niveles: ["inicio", "intermedio"], menores: true, precios: { individual: 26000, grupal: 12500 },
    sedes: [club("Complejo La Arboleda", "canning", 0.004, -0.003), club("Pádel del Sur", "ezeiza", -0.002, 0.004)],
    franjas: [...SEMANA_MANANA_TARDE, ...FINDE], reservaOnline: true, plan: "pro", resenas: [22, 4.7],
  },
  {
    id: "martin-acosta", nombre: "Martín Acosta", desde: 2012, juega: "Ex 1ra, hoy entrena competencia",
    bio: "Preparo parejas para torneos amateur: táctica, lectura del partido y los golpes que definen. Grupos chicos de nivel parejo.",
    niveles: ["avanzado", "competencia"], menores: false, precios: { individual: 32000, grupal: 15000 },
    sedes: [club("Club Los Cedros", "monte-grande", 0.003, 0.002)],
    franjas: TARDES, reservaOnline: true, plan: "pro", resenas: [31, 4.8],
  },
  {
    id: "valentina-rios", nombre: "Valentina Ríos", desde: 2019, juega: "Juega en 4ta",
    bio: "Clases para adultos que empiezan y escuelita para chicos de 6 a 14. Mucha pelota, poco sermón.",
    niveles: ["inicio", "intermedio"], menores: true, precios: { individual: 22000, grupal: 10000 },
    sedes: [club("Polideportivo Las Palmas", "luis-guillon", -0.002, 0.003)],
    franjas: [...TARDES, ...FINDE], reservaOnline: true, plan: "pro", resenas: [14, 4.6],
  },
  {
    id: "diego-salvatierra", nombre: "Diego Salvatierra", desde: 2010, juega: "Juega en 2da",
    bio: "Técnica fina de remates y salida de pared. Trabajo con video del celular para que veas lo que corregimos.",
    niveles: ["intermedio", "avanzado", "competencia"], menores: false, precios: { individual: 30000, grupal: 0 },
    sedes: [club("Complejo El Galpón", "lomas", 0.003, -0.004), club("Club Atlético Banfield Sur", "banfield", -0.003, 0.002)],
    franjas: SEMANA_MANANA_TARDE, reservaOnline: true, plan: "pro", resenas: [27, 4.5],
  },
  {
    id: "camila-benitez", nombre: "Camila Benítez", desde: 2021, juega: "Juega en 5ta",
    bio: "Grupales de 4 por nivel, todas las mañanas. Si te falta compañero, te armo el grupo.",
    niveles: ["inicio", "intermedio"], menores: false, precios: { individual: 21000, grupal: 9500 },
    sedes: [club("Pádel Adrogué Centro", "adrogue", 0.002, 0.002)],
    franjas: SEMANA_MANANA_TARDE, reservaOnline: true, plan: "gratis", resenas: [6, 4.5],
  },
  {
    id: "pablo-quiroga", nombre: "Pablo Quiroga", desde: 2014, juega: "Juega en 3ra",
    bio: "Clases individuales con foco en el físico y el desplazamiento. Ideal si venís de otro deporte de raqueta.",
    niveles: ["intermedio", "avanzado"], menores: false, precios: { individual: 28000, grupal: 13000 },
    sedes: [club("Club Los Cedros", "monte-grande", 0.003, 0.002), club("Complejo La Arboleda", "canning", 0.004, -0.003)],
    franjas: [...TARDES, ...FINDE], reservaOnline: true, plan: "pro", resenas: [18, 4.3],
  },
  {
    id: "romina-castro", nombre: "Romina Castro", desde: 2018, juega: "Juega en 4ta",
    bio: "Escuelita de menores y clases para mamás y papás que acompañan. Horarios a la salida del colegio.",
    niveles: ["inicio"], menores: true, precios: { individual: 20000, grupal: 9000 },
    sedes: [club("Club Social Las Lomas", "temperley", 0.002, -0.002)],
    franjas: TARDES, reservaOnline: true, plan: "pro", resenas: [11, 4.9],
  },
  {
    id: "gonzalo-medina", nombre: "Gonzalo Medina", desde: 2015, juega: "Juega en 3ra",
    bio: "Doy en Tristán Suárez y Ezeiza. Me adapto: individual, de a dos o grupos de cuatro.",
    niveles: ["inicio", "intermedio", "avanzado"], menores: false, precios: { individual: 24000, grupal: 11000 },
    sedes: [club("Pádel Tristán", "tristan-suarez", 0.002, 0.003), club("Pádel del Sur", "ezeiza", -0.002, 0.004)],
    franjas: SEMANA_MANANA_TARDE, reservaOnline: true, plan: "pro", resenas: [9, 4.2],
  },
  {
    id: "florencia-paz", nombre: "Florencia Paz", desde: 2020, juega: "Juega en 5ta",
    bio: "Clases para gente que nunca agarró una paleta. Te presto paleta las primeras dos clases.",
    niveles: ["inicio"], menores: true, precios: { individual: 19000, grupal: 8500 },
    sedes: [club("Complejo Los Robles", "burzaco", -0.002, 0.002)],
    franjas: [...TARDES, ...FINDE], reservaOnline: true, plan: "gratis", resenas: [3, 4.8],
  },
  {
    id: "ezequiel-romero", nombre: "Ezequiel Romero", desde: 2011, juega: "Ex jugador profesional",
    bio: "Alto rendimiento: planificación por temporada para parejas que compiten en circuitos amateur.",
    niveles: ["avanzado", "competencia"], menores: false, precios: { individual: 40000, grupal: 0 },
    sedes: [club("Complejo La Arboleda", "canning", 0.004, -0.003)],
    franjas: [{ dia: 2, desde: "07:00", hasta: "11:00" }, { dia: 4, desde: "07:00", hasta: "11:00" }, { dia: 6, desde: "08:00", hasta: "11:00" }],
    reservaOnline: true, plan: "pro", resenas: [12, 4.6],
  },
  {
    id: "agustina-lopez", nombre: "Agustina López", desde: 2022, juega: "Juega en 4ta",
    bio: "Recién sumada a la app: todavía no tengo reseñas. Primera clase a mitad de precio para que me conozcas.",
    niveles: ["inicio", "intermedio"], menores: false, precios: { individual: 21000, grupal: 10000 },
    sedes: [club("Complejo El Galpón", "lomas", 0.003, -0.004)],
    franjas: TARDES, reservaOnline: true, plan: "gratis", resenas: [0, 0],
  },
  {
    id: "sergio-villalba", nombre: "Sergio Villalba", desde: 2009, juega: "Juega en 2da",
    bio: "Veinte años de cancha. Doy en Monte Grande y Luis Guillón; los turnos se arreglan por WhatsApp.",
    niveles: ["intermedio", "avanzado"], menores: false, precios: { individual: 27000, grupal: 12000 },
    sedes: [club("Polideportivo Las Palmas", "luis-guillon", -0.002, 0.003)],
    franjas: SEMANA_MANANA_TARDE, reservaOnline: false, plan: "basica", resenas: [0, 0],
  },
];

const rnd = semilla(20261017);

export const PROFES = BASE.map((p) => {
  const [cantidad, media] = p.resenas;
  const iniciales = p.nombre.split(" ").map((x) => x[0]).join("").slice(0, 2);
  return { ...p, iniciales, duracion: 60, resenas: resenasDe(p.id, cantidad, media, rnd) };
});

/**
 * Clases tomadas en los próximos días (para que el turnero no muestre todo libre). Determinístico.
 * Set de "AAAA-MM-DD HH:MM" por profe.
 */
export function tomadasDe(profeId) {
  const r = semilla([...profeId].reduce((s, c) => s + c.charCodeAt(0), 0));
  const set = new Set();
  for (let d = 0; d < 8; d++) {
    const fecha = new Date(`${HOY}T12:00:00Z`);
    fecha.setUTCDate(fecha.getUTCDate() + d);
    const f = fecha.toISOString().slice(0, 10);
    for (let h = 7; h < 22; h++) if (r() < 0.45) set.add(`${f} ${String(h).padStart(2, "0")}:00`);
  }
  return set;
}

/** La clase que la demo usa para mostrar cómo puntúa un alumno (llega desde su link de padel-clases). */
export const CLASE_DEMO = {
  id: "clase-demo-1",
  profeId: "lucia-ferreyra",
  estado: "DADA",
  alumnoToken: "demo-token",
  alumnoId: "alumno-demo",
  alumnoNombre: "Vos (alumno de ejemplo)",
  fecha: sumarDias(HOY, -1),
  hora: "18:00",
  resenada: false,
};
