// Motor de Bandeja — el directorio para encontrar y puntuar profes de pádel por cercanía.
// Cada profe del directorio trabaja con el módulo padel-clases del ERP: de ahí salen las clases DADAS,
// y sólo un alumno con una clase dada puede puntuar (reseña verificada).
//
// ES module puro, sin DOM ni red: lo carga el navegador tal cual y lo cubre src/lib/bandeja/motor.test.ts.
// Producto y estrategia: docs/producto/bandeja/README.md.

/** Los cuatro criterios que puntúa el alumno, de 1 a 5. */
export const CRITERIOS = Object.freeze([
  { id: "ensena", nombre: "Cómo explica" },
  { id: "progreso", nombre: "Cuánto mejoré" },
  { id: "puntualidad", nombre: "Puntualidad" },
  { id: "trato", nombre: "Buena onda" },
]);

export const NIVELES = Object.freeze([
  { id: "inicio", nombre: "Arranco de cero" },
  { id: "intermedio", nombre: "Ya juego (7ma–6ta)" },
  { id: "avanzado", nombre: "Avanzado (5ta–4ta)" },
  { id: "competencia", nombre: "Competencia (3ra o más)" },
]);

/** Reglas de la reseña y del puntaje. Cambiarlas cambia el orden del directorio: quedan a la vista. */
export const REGLAS = Object.freeze({
  previo: 4.0, // puntaje que se le supone a un profe sin reseñas (promedio de la plaza, a calibrar)
  peso: 5, // cuántas reseñas "vale" ese supuesto: con pocas reseñas, el puntaje se acerca a 4.0
  diasParaResenar: 30, // el link para puntuar vence 30 días después de la clase
  largoMaxTexto: 400,
  castigoPorKm: 0.04, // en "Recomendados", cada km resta 0,04 puntos
  minimoParaPuntaje: 3, // con menos reseñas, la ficha sale como «Nuevo» y no muestra promedio
});

const RADIO_TIERRA_KM = 6371;

/** Distancia en km entre dos puntos {lat, lng} (haversine). */
export function distanciaKm(a, b) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** La sede del profe más cerca del punto, con su distancia. El profe declara dónde da clases, no dónde vive. */
export function sedeMasCercana(profe, punto) {
  let mejor = null;
  for (const sede of profe.sedes) {
    const km = distanciaKm(punto, sede);
    if (!mejor || km < mejor.km) mejor = { sede, km };
  }
  return mejor;
}

const promedioDe = (r) => CRITERIOS.reduce((s, c) => s + r.puntos[c.id], 0) / CRITERIOS.length;

/**
 * Las reseñas que cuentan: verificadas, y una sola voz por alumno (la última).
 * Así un alumno fiel con 40 clases no pesa 40 veces, y nadie infla a su profe reseñando en serie.
 */
export function resenasQueCuentan(resenas) {
  const porAlumno = new Map();
  for (const r of resenas) {
    if (!r.verificada) continue;
    const previa = porAlumno.get(r.alumnoId);
    if (!previa || r.fecha > previa.fecha) porAlumno.set(r.alumnoId, r);
  }
  return [...porAlumno.values()].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

/** Resumen del profe: cantidad, promedio simple, promedio por criterio y el puntaje del ranking. */
export function resumen(resenas, reglas = REGLAS) {
  const cuentan = resenasQueCuentan(resenas);
  const n = cuentan.length;
  const suma = cuentan.reduce((s, r) => s + promedioDe(r), 0);
  const porCriterio = {};
  for (const c of CRITERIOS) {
    porCriterio[c.id] = n ? redondear(cuentan.reduce((s, r) => s + r.puntos[c.id], 0) / n, 1) : null;
  }
  return {
    cantidad: n,
    promedio: n ? redondear(suma / n, 1) : null,
    muestraPuntaje: n >= reglas.minimoParaPuntaje,
    // Promedio bayesiano: con pocas reseñas no se puede ser el primero de la lista con un solo 5.
    puntaje: (reglas.previo * reglas.peso + suma) / (reglas.peso + n),
    porCriterio,
  };
}

const redondear = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

/**
 * Busca profes cerca de `punto` con los filtros del jugador y los ordena.
 * filtros: { radioKm, nivel, modalidad: "individual"|"grupal", menores, precioMax, soloReservaOnline, texto }
 * orden: "recomendados" | "cerca" | "puntaje" | "precio"
 */
export function buscar(profes, punto, filtros = {}, orden = "recomendados", reglas = REGLAS) {
  const texto = normalizar(filtros.texto || "");
  const filas = [];
  for (const profe of profes) {
    const cerca = sedeMasCercana(profe, punto);
    if (!cerca) continue;
    if (filtros.radioKm && cerca.km > filtros.radioKm) continue;
    if (filtros.nivel && !profe.niveles.includes(filtros.nivel)) continue;
    if (filtros.modalidad === "grupal" && !profe.precios.grupal) continue;
    if (filtros.modalidad === "individual" && !profe.precios.individual) continue;
    if (filtros.menores && !profe.menores) continue;
    if (filtros.precioMax && precioPara(profe, filtros.modalidad) > filtros.precioMax) continue;
    if (filtros.soloReservaOnline && !profe.reservaOnline) continue;
    if (texto && !normalizar([profe.nombre, ...profe.sedes.map((s) => `${s.club} ${s.localidad}`)].join(" ")).includes(texto)) continue;
    const res = resumen(profe.resenas, reglas);
    filas.push({ profe, sede: cerca.sede, km: cerca.km, resumen: res, valor: res.puntaje - reglas.castigoPorKm * cerca.km });
  }
  const por = {
    recomendados: (a, b) => b.valor - a.valor || a.km - b.km,
    cerca: (a, b) => a.km - b.km || b.resumen.puntaje - a.resumen.puntaje,
    puntaje: (a, b) => b.resumen.puntaje - a.resumen.puntaje || a.km - b.km,
    precio: (a, b) => precioPara(a.profe, filtros.modalidad) - precioPara(b.profe, filtros.modalidad) || a.km - b.km,
  }[orden];
  if (!por) throw new Error(`Orden desconocido: ${orden}`);
  return filas.sort(por);
}

/** El precio más bajo por persona que ofrece el profe (grupal si tiene, si no individual). */
export function precioDesde(profe) {
  const { individual, grupal } = profe.precios;
  return Math.min(...[individual, grupal].filter((x) => x > 0));
}

/** El precio que le importa al jugador según la clase que busca: individual, grupal o el más bajo. */
export function precioPara(profe, modalidad) {
  if (modalidad === "individual" || modalidad === "grupal") return profe.precios[modalidad] || Infinity;
  return precioDesde(profe);
}

export function normalizar(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

// ── Reseña verificada ────────────────────────────────────────────────────────────────────────────────

// Un celular argentino tiene 10 números (11 6187 0066); con 8 se cortaban textos como «2025 2026».
const TELEFONO = /(\+?\d[\s\-.]?){10,}/;
const LINK = /(https?:\/\/|www\.|\.com\b|\.ar\b|@\w{3,})/i;

/**
 * ¿Puede este alumno dejar esta reseña? La clase tiene que existir en la app del profe, estar DADA,
 * ser de ese alumno (por su token), no tener reseña y no haber vencido el plazo.
 * El texto no puede llevar teléfonos, links ni arrobas: el directorio no es un canal para sacar alumnos.
 * Devuelve { ok: true, resena } o { ok: false, error } con el error en castellano, listo para mostrar.
 */
export function validarResena({ clase, token, puntos, texto = "", ahora }, reglas = REGLAS) {
  if (!clase) return { ok: false, error: "No encontramos esa clase. Puntuá desde el link que te mandó tu profe." };
  if (!token || clase.alumnoToken !== token) return { ok: false, error: "Este link no es de esta clase." };
  if (clase.estado !== "DADA") return { ok: false, error: "Se puntúa cuando la clase ya se dio." };
  if (clase.resenada) return { ok: false, error: "Esta clase ya tiene tu reseña." };
  const dias = (Date.parse(ahora) - Date.parse(clase.fecha)) / 86_400_000;
  if (dias < 0) return { ok: false, error: "Se puntúa cuando la clase ya se dio." };
  if (dias > reglas.diasParaResenar) {
    return { ok: false, error: `El link para puntuar vence a los ${reglas.diasParaResenar} días de la clase.` };
  }
  for (const c of CRITERIOS) {
    const v = puntos?.[c.id];
    if (!Number.isInteger(v) || v < 1 || v > 5) return { ok: false, error: `Falta puntuar «${c.nombre}».` };
  }
  const limpio = texto.trim().replace(/\s+/g, " ");
  if (limpio.length > reglas.largoMaxTexto) {
    return { ok: false, error: `El comentario puede tener hasta ${reglas.largoMaxTexto} letras.` };
  }
  if (TELEFONO.test(limpio) || LINK.test(limpio)) {
    return { ok: false, error: "Sacá teléfonos, links o arrobas del comentario." };
  }
  return {
    ok: true,
    resena: {
      id: `r-${clase.id}`,
      claseId: clase.id,
      alumnoId: clase.alumnoId,
      alumno: clase.alumnoNombre,
      fecha: ahora.slice(0, 10),
      fechaClase: clase.fecha,
      puntos: { ...puntos },
      texto: limpio,
      verificada: true,
    },
  };
}

// ── Horarios libres (la vista previa del turnero del profe) ─────────────────────────────────────────
// Misma regla que padel-clases (src/lib/padel/core.ts en esa rama): franjas semanales del profe − clases
// tomadas − anticipación mínima. Acá en hora de pared: fecha "AAAA-MM-DD" y minutos desde las 00:00.

const aMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const hora = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function sumarDias(fecha, n) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const diaSemana = (fecha) => new Date(`${fecha}T12:00:00Z`).getUTCDay();

/**
 * Los turnos libres de los próximos `dias` días, agrupados por fecha.
 * franjas: [{ dia: 0..6, desde: "08:00", hasta: "12:00" }] · tomadas: Set de "AAAA-MM-DD HH:MM"
 * ahora: { fecha, min } · devuelve [{ fecha, horas: ["08:00", …] }] sin los días vacíos.
 */
export function proximosLibres({ franjas, duracion = 60, anticipacionMin = 120, tomadas = new Set(), ahora, dias = 7 }) {
  const salida = [];
  for (let i = 0; i < dias; i++) {
    const fecha = sumarDias(ahora.fecha, i);
    const dia = diaSemana(fecha);
    const horas = [];
    for (const f of franjas.filter((x) => x.dia === dia)) {
      for (let m = aMin(f.desde); m + duracion <= aMin(f.hasta); m += duracion) {
        const faltan = i * 1440 + m - ahora.min;
        if (faltan < anticipacionMin) continue;
        if (tomadas.has(`${fecha} ${hora(m)}`)) continue;
        horas.push(hora(m));
      }
    }
    if (horas.length) salida.push({ fecha, horas: horas.sort() });
  }
  return salida;
}

// ── Formatos ─────────────────────────────────────────────────────────────────────────────────────────

const PESOS = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** $ 25.000 — sin decimales: en clases de pádel los centavos no existen. */
export const plata = (n) => `$ ${PESOS.format(n)}`;

/** 0,8 km · 3,4 km · 12 km */
export function km(n) {
  if (n < 10) return `${n.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(n)} km`;
}

/** Nombre del alumno como se publica: "Juan P." (nunca el apellido entero ni el teléfono). */
export function nombrePublico(nombre) {
  const [pila, ...resto] = nombre.trim().split(/\s+/);
  return resto.length ? `${pila} ${resto[0][0].toUpperCase()}.` : pila;
}
