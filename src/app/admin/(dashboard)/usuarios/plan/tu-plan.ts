// ============================================================================
// "TU PLAN" (R3-F3) — qué incluye el plan del negocio, cuánto usa y cómo pedir más. PURA.
// ============================================================================
//
// La pantalla vive por ahora dentro de la app Usuarios (/admin/usuarios/plan): es adonde va quien
// choca con el tope de personas con usuario (DESTINO_SIN_LUGAR_USUARIOS) y así la protege la misma
// guardia (`requireApp("usuarios")`, sólo el dueño). Cuando el registro tenga su propia app
// "tu-plan", se muda con la ruta; esta lógica no cambia.
//
// Reglas: lo que no se midió no se inventa (se muestra sólo lo que incluye el plan); un límite que
// no frena (comprobantes) nunca dice que se bloquea una venta; el precio va marcado "provisional a
// confirmar" (src/planes/precios.ts).

import { LIMITE_IDS, planPorId, type LimiteId } from "@/planes/catalogo";
import { decidirAlta, evaluarUso, LIMITES, type LimitesDelNegocio, type NivelDeUso } from "@/planes/limites";
import { PRECIOS_PROVISIONALES } from "@/planes/precios";

/** La ruta de la pantalla (y la base del destino de quien choca con el tope). */
export const RUTA_TU_PLAN = "/admin/usuarios/plan";

/** Lo que se pudo contar, por límite. Un límite ausente = no se midió. */
export type UsoMedido = Partial<Record<LimiteId, number>>;

export interface FilaDeTuPlan {
  id: LimiteId;
  nombre: string;
  /** Lo que se lee a la derecha: «2 de 2», «Hasta 1 local», «14 · sin tope». */
  cifra: string;
  /** La frase de abajo, en palabras. */
  detalle: string;
  nivel: NivelDeUso | "sin-medir";
}

export type VistaDeTuPlan =
  | { tipo: "sin-plan"; texto: string }
  | {
      tipo: "plan";
      nombrePlan: string;
      /** «$ 34.900 por mes (provisional a confirmar)». */
      precio: string;
      filas: FilaDeTuPlan[];
      /** El porqué de lo que no se pudo hacer (?no-se-pudo=usuarios), o `null`. */
      aviso: { texto: string; tono: "peligro" | "info" } | null;
    };

const TEXTO_SIN_PLAN =
  "Tu negocio todavía no tiene un plan asignado, así que no hay topes. Si querés saber qué plan te conviene, escribinos.";

function cantidad(n: number, id: LimiteId): string {
  const u = LIMITES[id].unidad;
  return `${n.toLocaleString("es-AR")} ${n === 1 ? u.uno : u.varios}`;
}

function detalleConUso(id: LimiteId, nivel: NivelDeUso, quedan: number | null, usados: number, tope: number | null): string {
  const bloquea = LIMITES[id].bloquea;
  if (nivel === "sin-tope") return "Tu plan no le pone tope.";
  if (nivel === "holgado") return `Te quedan ${cantidad(quedan ?? 0, id)}.`;
  if (nivel === "cerca")
    return bloquea
      ? `Te quedan ${cantidad(quedan ?? 0, id)}. Si vas a necesitar más, pedilo antes de llegar.`
      : `Ya usaste el 80 % de lo que incluye tu plan este mes. Tus ventas y facturas siguen igual.`;
  if (!bloquea) {
    return nivel === "pasado"
      ? `Pasaste lo que incluye tu plan este mes (${(usados - (tope ?? 0)).toLocaleString("es-AR")} de más). Tus ventas y facturas siguen igual; hablemos para ajustar el plan.`
      : "Llegaste a lo que incluye tu plan este mes. Tus ventas y facturas siguen igual.";
  }
  return nivel === "pasado"
    ? "Tenés más de lo que incluye tu plan: no se pueden sumar nuevos hasta ajustar el plan."
    : "Llegaste al tope de tu plan: para sumar otro, pedí más o da de baja uno que ya no uses.";
}

/** Una fila por límite, en el orden del catálogo. */
export function filasDeTuPlan(limites: LimitesDelNegocio, uso: UsoMedido): FilaDeTuPlan[] {
  return LIMITE_IDS.map((id): FilaDeTuPlan => {
    const t = limites.topes[id];
    const ajuste = t.origen === "excepcion" ? " Ajustado para tu negocio por Gestión Studio Grow." : "";
    const usados = uso[id];
    if (usados === undefined) {
      return t.valor === null
        ? { id, nombre: LIMITES[id].nombre, cifra: "Sin tope", detalle: `Tu plan no le pone tope.${ajuste}`, nivel: "sin-medir" }
        : {
            id,
            nombre: LIMITES[id].nombre,
            cifra: `Hasta ${cantidad(t.valor, id)}`,
            detalle: `Tu plan incluye hasta ${cantidad(t.valor, id)}.${ajuste}`,
            nivel: "sin-medir",
          };
    }
    const u = evaluarUso(t.valor, usados);
    const cifra = u.tope === null ? `${usados.toLocaleString("es-AR")} · sin tope` : `${usados.toLocaleString("es-AR")} de ${u.tope.toLocaleString("es-AR")}`;
    return { id, nombre: LIMITES[id].nombre, cifra, detalle: detalleConUso(id, u.nivel, u.quedan, usados, u.tope) + ajuste, nivel: u.nivel };
  });
}

/** Lo que el negocio no pudo hacer, según `?no-se-pudo=`. Hoy sólo "usuarios". */
function avisoDe(noSePudo: string | undefined, limites: LimitesDelNegocio, uso: UsoMedido): { texto: string; tono: "peligro" | "info" } | null {
  if (noSePudo !== "usuarios") return null;
  const usados = uso.usuarios;
  if (usados === undefined) return { texto: "No se pudo sumar a la persona porque tu plan llegó a su tope de personas con usuario.", tono: "peligro" };
  const d = decidirAlta(limites, "usuarios", usados);
  if (!d.ok) return { texto: `No se pudo sumar a la persona. ${d.motivo}`, tono: "peligro" };
  return { texto: "Ahora hay lugar para una persona más: volvé a Usuarios y cargala de nuevo.", tono: "info" };
}

export function vistaDeTuPlan(p: { limites: LimitesDelNegocio; uso: UsoMedido; noSePudo?: string }): VistaDeTuPlan {
  const { limites, uso } = p;
  if (limites.plan === null) return { tipo: "sin-plan", texto: TEXTO_SIN_PLAN };
  const precio = PRECIOS_PROVISIONALES[limites.plan];
  return {
    tipo: "plan",
    nombrePlan: planPorId(limites.plan).nombre,
    precio: `$ ${precio.mensual.toLocaleString("es-AR")} por mes (${precio.estado})`,
    filas: filasDeTuPlan(limites, uso),
    aviso: avisoDe(p.noSePudo, limites, uso),
  };
}

/** Número de WhatsApp de GSG: sólo dígitos, de 10 a 15. Otra cosa = no hay número. */
export function numeroDeWhatsApp(crudo: string | undefined): string | null {
  const n = (crudo ?? "").replace(/[\s+\-()]/g, "");
  return /^\d{10,15}$/.test(n) ? n : null;
}

/**
 * «Quiero más»: abre WhatsApp con el mensaje escrito. Con el número de GSG va directo; sin número
 * configurado, WhatsApp pide elegir a quién mandarlo (nunca un enlace roto).
 */
export function enlaceQuieroMas(p: { numero: string | undefined; negocio: string; nombrePlan: string | null }): string {
  const texto = p.nombrePlan
    ? `Hola, soy de ${p.negocio}. Tengo el plan ${p.nombrePlan} y quiero más de lo que incluye.`
    : `Hola, soy de ${p.negocio}. Quiero saber qué plan me conviene.`;
  const numero = numeroDeWhatsApp(p.numero);
  return `https://wa.me/${numero ?? ""}?text=${encodeURIComponent(texto)}`;
}
