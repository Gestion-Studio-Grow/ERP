// NOMBRES DE TECLA — que las teclas de una góndola no repitan el proveedor.
//
// En el catálogo real el nombre suele traer el proveedor o la marca pegados con un separador
// («Lomo — Frigorífico El Novillo», «Novillo · Vacío»). En una grilla de 12 teclas, ese pedazo se
// repite en todas, se come el ancho y trunca lo que importa: el corte. Acá se saca el pedazo que se
// repite en dos o más teclas de la misma góndola y, si es el mismo en todas, se dice UNA vez arriba.
//
// Reglas (para no perder información):
//   · sólo se corta por un separador con espacios a los lados (« — », « – », « - », « · », « | », « / »);
//     nunca por palabras sueltas («Pollo entero» / «Pollo trozado» quedan como están);
//   · se corta el pedazo final o, si no, el inicial, sólo si aparece en 2+ teclas;
//   · si al cortar dos teclas quedan iguales, esas dos conservan el nombre completo.
// Lo completo queda en `title` de la tecla. PURO.

const SEPARADOR = /\s+[—–\-·|/]\s+/;

const clave = (s: string) => s.trim().toLocaleLowerCase("es-AR");

export type NombresDeTecla = {
  /** El nombre a mostrar en cada tecla, en el mismo orden. */
  cortos: string[];
  /** El pedazo que tenían TODAS (2+), para decirlo una vez; `null` si no hay uno común. */
  comun: string | null;
};

export function nombresSinRepetir(nombres: readonly string[]): NombresDeTecla {
  const partes = nombres.map((n) => n.split(SEPARADOR).map((p) => p.trim()).filter(Boolean));
  const cuenta = new Map<string, number>();
  for (const p of partes) {
    if (p.length < 2) continue;
    // Un mismo nombre cuenta una sola vez por pedazo.
    for (const k of new Set([clave(p[0]), clave(p[p.length - 1])])) cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }
  const repetido = (s: string) => (cuenta.get(clave(s)) ?? 0) >= 2;

  const cortados = partes.map((p, i) => {
    if (p.length < 2) return { corto: nombres[i], fuera: null as string | null };
    const ultimo = p[p.length - 1];
    if (repetido(ultimo)) return { corto: p.slice(0, -1).join(" · "), fuera: ultimo };
    if (repetido(p[0])) return { corto: p.slice(1).join(" · "), fuera: p[0] };
    return { corto: nombres[i], fuera: null };
  });

  // Dos teclas que quedarían iguales se distinguen por el nombre completo.
  const veces = new Map<string, number>();
  for (const c of cortados) veces.set(clave(c.corto), (veces.get(clave(c.corto)) ?? 0) + 1);
  const finales = cortados.map((c, i) => (c.fuera && (veces.get(clave(c.corto)) ?? 0) > 1 ? { corto: nombres[i], fuera: null } : c));

  const fuera = finales.map((c) => c.fuera);
  const primero = fuera[0];
  const comun = nombres.length >= 2 && primero && fuera.every((f) => f && clave(f) === clave(primero)) ? primero : null;
  return { cortos: finales.map((c) => c.corto), comun };
}
