// Reglas puras de la vidriera del taller, compartidas por servidor (home) y cliente (turno). Sin base ni React.

/** Precio público de un trabajo, para ir detrás de «desde»: «$ 25.000». Sin precio no se llama: nunca un precio en cero. */
// Miles con punto a mano, sin Intl: el mismo texto en el servidor y en cualquier navegador (sin depender de que
// el navegador traiga los datos de es-AR; un Chrome headless devolvía «60,000» y no coincidía con el servidor).
export function desde(price: number): string {
  return `$ ${String(Math.round(price)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** Misma regla en home y turno: sólo trabajos reales y con precio (los «de ejemplo» del alta no salen). */
export function esTrabajoPublicable(s: { name: string; price: number }): boolean {
  return s.price > 0 && !/de ejemplo/i.test(s.name);
}

// ── El horario publicado sale de la agenda ────────────────────────────────────────────────────────────
// El sitio decía «Lun a vie · 8:30 a 12 y 14:30 a 19 h» (texto del panel, sólo el jueves verificado) y la agenda
// ofrecía sábados y 8 a 17 corrido: se podía sacar turno con el taller «cerrado» (QA AGR 29/10, MEDIA-1). Ahora el
// horario que se publica es el de la agenda (`WorkingHours` de los mecánicos que toman turnos): si el dueño lo
// corrige en el panel, cambian las dos cosas juntas.

type Franja = { dayOfWeek: number; startTime: string; endTime: string };
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;
const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
const hora = (min: number) => `${Math.floor(min / 60)}${min % 60 ? `:${String(min % 60).padStart(2, "0")}` : ""}`;

/** «Lun a sáb · 8 a 17 h» (días seguidos con el mismo horario, juntos); null si la agenda no tiene horarios. */
export function horarioDeLaAgenda(franjas: readonly Franja[]): string | null {
  const porDia = new Map<number, [number, number][]>();
  for (const f of franjas) {
    const a = minutos(f.startTime);
    const b = minutos(f.endTime);
    if (!(f.dayOfWeek >= 0 && f.dayOfWeek <= 6) || !Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;
    porDia.set(f.dayOfWeek, [...(porDia.get(f.dayOfWeek) ?? []), [a, b]]);
  }
  // Varios mecánicos el mismo día: la unión de sus horarios (lo que el taller está abierto para turnos).
  const texto = new Map<number, string>();
  for (const [d, rangos] of porDia) {
    const unidos: [number, number][] = [];
    for (const [a, b] of rangos.sort((x, y) => x[0] - y[0])) {
      const u = unidos[unidos.length - 1];
      if (u && a <= u[1]) u[1] = Math.max(u[1], b);
      else unidos.push([a, b]);
    }
    texto.set(d, `${unidos.map(([a, b]) => `${hora(a)} a ${hora(b)}`).join(" y ")} h`);
  }
  if (texto.size === 0) return null;
  const grupos: { desde: number; hasta: number; t: string }[] = [];
  for (const d of ORDEN_SEMANA) {
    const t = texto.get(d);
    const g = grupos[grupos.length - 1];
    if (!t) continue;
    if (g && g.t === t && ORDEN_SEMANA.indexOf(g.hasta as (typeof ORDEN_SEMANA)[number]) === ORDEN_SEMANA.indexOf(d) - 1) g.hasta = d;
    else grupos.push({ desde: d, hasta: d, t });
  }
  const may = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return grupos
    .map((g, i) => {
      const dias = g.desde === g.hasta ? DIAS[g.desde] : `${DIAS[g.desde]} a ${DIAS[g.hasta]}`;
      return `${i === 0 ? may(dias) : dias} · ${g.t}`;
    })
    .join(" · ");
}
