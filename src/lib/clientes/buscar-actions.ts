"use server";

// ============================================================================
// buscarClientasYTurnos(q) — el buscador global «/» (reingeniería CH, Tanda 2, §3.5). SÓLO LECTURA.
// ============================================================================
//
// Hasta 8 clientas (nombre o teléfono) con su próximo turno, lo que deben, sus faltazos y su última
// visita, y hasta 5 turnos que vienen. Devuelve los renglones YA ARMADOS (buscar-core.ts): al
// navegador cruza lo que se pinta, no las filas de la base.
//
// CÓMO SE CUIDA:
//   · Sesión y permiso: `requireCapability("agenda:read")` (sin sesión, al login; sin la capacidad,
//     a su casa). Lo demás se decide con las capacidades del rol: sin clients:read no se LEEN
//     clientas (no es que se lean y se escondan).
//   · Una PROFESIONAL ve sólo SUS turnos (fail-closed sin `professionalId`, igual que la bandeja
//     de pasados: `soloDeQuienMira` en src/lib/turnos/sin-cerrar.server.ts).
//   · Negocio: predicado `tenantId` en CADA `where`, además de RLS (el `prisma` de la app con
//     RLS_ENFORCEMENT=on). Un id o un teléfono de otro negocio no vuelve (CH-063).
//   · Límite: 25 filas leídas para ordenar, 8 clientas y 5 turnos devueltos; las lecturas de
//     turnos, sólo de esas 8.
//   · Entrada: `leerBusqueda` (2 a 60 letras). En el log va el largo, no lo buscado (puede ser un
//     teléfono). Los errores dicen qué hacer.
//
// TILDES Y MAYÚSCULAS (cert CH T2, O-8): el nombre se compara sin tildes ni mayúsculas EN LA CONSULTA
// (`lower(replace(…replace(name, 'á', 'a')…))`, funciones de Postgres de siempre: sin extensión, sin
// índice nuevo, sin migración), así «gomez» trae a «Gómez» y «GÓMEZ». Lo tipeado se normaliza igual
// (`normalizarBusqueda`) y se escapan `%`, `_` y `\` (se buscan tal cual, nunca abren comodines). Va en
// una transacción del negocio (RLS con su GUC) y con `tenantId` escrito en el `where`.
//
// LÍMITES CONOCIDOS: sin índice de trigramas (`LIKE '%q%'` recorre las fichas del negocio: cientos,
// no millones); el teléfono se compara tal como se guardó o por sus dígitos seguidos (sin columna
// normalizada: sería una migración).

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { normalizarBusqueda } from "@/modules/nav-search";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox } from "@/lib/demo-flag";
import { isColumnMissing } from "@/lib/prisma-errors";
import { logger } from "@/lib/logger";
import { cobrosDetalladosPorTurno } from "@/lib/turnos/anulacion";
import { puedeCobrarEsteTurno } from "@/lib/turnos/cobro-mostrador";
import { leerBusqueda } from "@/lib/buscador/registros-core";
import type { GrupoDeFichas } from "@/components/ui/comandos-core";
import {
  FILAS_A_LEER,
  LIMITE_CLIENTAS,
  LIMITE_TURNOS,
  armarFichas,
  ordenarClientas,
  type ClientaLeida,
  type CompletadoLeido,
  type PermisosDelBuscador,
  type TurnoLeido,
} from "./buscar-core";

export type ResultadoDelBuscador = { ok: true; grupos: GrupoDeFichas[] } | { ok: false; mensaje: string };

/** Cuántos turnos que vienen se leen por búsqueda (de hasta 8 clientas): sobra para el próximo de cada una. */
const TURNOS_A_LEER = 40;

function inicioDeHoy(ahora: Date): Date {
  // Desde hace 12 h: un turno de esta mañana todavía «viene» para la recepción (puede estar en
  // curso). El corte fino de «hoy» lo dice la pantalla (`cuandoEs`).
  return new Date(ahora.getTime() - 12 * 3_600_000);
}

// Las letras con tilde (minúsculas y mayúsculas) y su letra sin tilde, en el mismo orden.
const CON_TILDE = "áàâäéèêëíìîïóòôöúùûüñçÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜÑÇ";
const SIN_TILDE = "aaaaeeeeiiiioooouuuuncAAAAEEEEIIIIOOOOUUUUNC";

/**
 * `lower(<nombre sin tildes>)` en SQL: un `replace` por letra (y no `translate`, que en una base
 * SQL_ASCII —la del arnés de tests— trabaja por byte y rompe las letras de dos bytes). En UTF8 (Neon)
 * da lo mismo; cada letra viaja como parámetro.
 */
const NOMBRE_SIN_TILDES: Prisma.Sql = [...CON_TILDE].reduce(
  (expr, letra, i) => Prisma.sql`replace(${expr}, ${letra}, ${SIN_TILDE[i]})`,
  Prisma.sql`"name"`,
);

/** `%`, `_` y `\` se buscan tal cual: LIKE usa `\` como escape por defecto. */
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Los ids (y nombre y teléfono) de las fichas del negocio cuyo nombre contiene lo tipeado SIN tildes
 * ni mayúsculas, o cuyo teléfono lo contiene (tal cual o por los dígitos). En orden de nombre.
 */
async function fichasQueCoinciden(
  tenantId: string,
  b: { texto: string; digitos?: string | null },
  limite: number,
): Promise<{ id: string; name: string; phone: string | null }[]> {
  const nombre = `%${escaparLike(normalizarBusqueda(b.texto))}%`;
  const telefono = `%${escaparLike(b.texto)}%`;
  const digitos = b.digitos && b.digitos.length >= 3 && b.digitos !== b.texto ? `%${escaparLike(b.digitos)}%` : null;
  return tenantTransaction(
    (tx) =>
      tx.$queryRaw<{ id: string; name: string; phone: string | null }[]>(Prisma.sql`
        SELECT "id", "name", "phone" FROM "Client"
        WHERE "tenantId" = ${tenantId}
          AND (
            lower(${NOMBRE_SIN_TILDES}) LIKE ${nombre}
            OR "phone" LIKE ${telefono}
            ${digitos ? Prisma.sql`OR "phone" LIKE ${digitos}` : Prisma.empty}
          )
        ORDER BY "name" ASC
        LIMIT ${limite}`),
    { tenantId },
  );
}

/** Para la profesional (sin clients:read): sólo los ids, para filtrar SUS turnos (no se devuelven fichas). */
const IDS_PARA_LA_PROFESIONAL = 200;

export async function buscarClientasYTurnos(q: unknown): Promise<ResultadoDelBuscador> {
  const busqueda = leerBusqueda(q);
  if (!busqueda.ok) return busqueda;

  // Fuera del try: el corte al login de `requireCapability` tiene que llegar a Next tal cual.
  const user = await requireCapability("agenda:read");
  if (isDemoSandbox()) return { ok: true, grupos: [] };
  const tenantId = await getCurrentTenantId();
  const permisos: PermisosDelBuscador = {
    verClientas: roleHasCapability(user.role, "clients:read"),
    darTurno: roleHasCapability(user.role, "agenda:manage"),
    cobrar: roleHasCapability(user.role, "agenda:collect"),
  };
  const soloDe = user.role === "PROFESSIONAL" ? (user.professionalId ?? "__no_professional__") : null;
  const { texto, digitos } = busqueda;
  const ahora = new Date();
  const porNombreOTelefono = [
    { name: { contains: texto, mode: "insensitive" as const } },
    { phone: { contains: texto } },
    ...(digitos && digitos.length >= 3 && digitos !== texto ? [{ phone: { contains: digitos } }] : []),
  ];

  try {
    let clientas: ClientaLeida[] = [];
    if (permisos.verClientas) {
      const filas = await fichasQueCoinciden(tenantId, { texto, digitos }, FILAS_A_LEER);
      clientas = ordenarClientas(
        filas.map((c) => ({ id: c.id, nombre: c.name, telefono: c.phone ?? "" })),
        busqueda,
      );
    }
    const ids = clientas.map((c) => c.id);
    // La profesional: SUS turnos cuya clienta coincide, también sin tildes (la consulta de siempre,
    // más los ids que trae la comparación sin tildes).
    const idsSinTilde = permisos.verClientas ? [] : (await fichasQueCoinciden(tenantId, { texto, digitos }, IDS_PARA_LA_PROFESIONAL)).map((c) => c.id);

    // Los turnos que vienen: de las clientas encontradas; la profesional (sin clientas), los SUYOS
    // cuya clienta coincide.
    const whereProximos = {
      tenantId,
      status: { in: ["PENDING" as const, "CONFIRMED" as const] },
      startsAt: { gte: inicioDeHoy(ahora) },
      ...(soloDe ? { professionalId: soloDe } : {}),
      ...(permisos.verClientas
        ? { clientId: { in: ids } }
        : { OR: [{ client: { OR: porNombreOTelefono } }, ...(idsSinTilde.length > 0 ? [{ clientId: { in: idsSinTilde } }] : [])] }),
    };
    const hayDondeBuscar = permisos.verClientas ? ids.length > 0 : true;
    const seleccion = (conFlag: boolean) =>
      ({
        id: true,
        clientId: true,
        startsAt: true,
        status: true,
        priceAtBooking: true,
        professionalId: true,
        client: { select: { name: true } },
        service: { select: { name: true, price: true, depositAmount: true } },
        professional: { select: conFlag ? { name: true, cobraEnMostrador: true } : { name: true } },
        payment: { select: { status: true, amount: true } },
      }) as const;
    type Proximo = {
      id: string;
      clientId: string;
      startsAt: Date;
      status: string;
      priceAtBooking: number | null;
      professionalId: string;
      client: { name: string };
      service: { name: string; price: number; depositAmount: number | null };
      professional: { name: string; cobraEnMostrador?: boolean };
      payment: { status: string; amount: number } | null;
    };
    const leerProximos = async (): Promise<Proximo[]> => {
      if (!hayDondeBuscar) return [];
      const args = { where: whereProximos, orderBy: { startsAt: "asc" as const }, take: permisos.verClientas ? TURNOS_A_LEER : LIMITE_TURNOS };
      try {
        return await prisma.appointment.findMany({ ...args, select: seleccion(true) });
      } catch (err) {
        // `cobraEnMostrador` sin migrar: rige el default (cobra el mostrador), como en la agenda.
        if (!isColumnMissing(err, "cobraEnMostrador")) throw err;
        return prisma.appointment.findMany({ ...args, select: seleccion(false) });
      }
    };

    const [proximosCrudos, completadosCrudos, faltazosCrudos] = await Promise.all([
      leerProximos(),
      ids.length > 0
        ? prisma.appointment.findMany({
            where: { tenantId, clientId: { in: ids }, status: "COMPLETED" },
            select: { id: true, clientId: true, startsAt: true, priceAtBooking: true, service: { select: { price: true } }, payment: { select: { status: true, amount: true } } },
          })
        : Promise.resolve([]),
      ids.length > 0
        ? prisma.appointment.findMany({ where: { tenantId, clientId: { in: ids }, status: "NO_SHOW" }, select: { clientId: true } })
        : Promise.resolve([]),
    ]);

    const cobros = await cobrosDetalladosPorTurno(prisma, tenantId, [...proximosCrudos.map((t) => t.id), ...completadosCrudos.map((t) => t.id)]);

    const proximos: TurnoLeido[] = proximosCrudos.map((t) => ({
      id: t.id,
      clienteId: t.clientId ?? "",
      clienta: t.client.name,
      inicio: t.startsAt,
      estado: t.status,
      servicio: t.service.name,
      profesional: t.professional.name,
      precio: t.priceAtBooking ?? t.service.price,
      depositAmount: t.service.depositAmount,
      pagoLegado: t.payment,
      cobrable: puedeCobrarEsteTurno({
        rol: user.role,
        professionalIdDelUsuario: user.professionalId,
        professionalIdDelTurno: t.professionalId,
        nombreProfesional: t.professional.name,
        cobraEnMostrador: t.professional.cobraEnMostrador,
      }).ok,
    }));
    const completados: CompletadoLeido[] = completadosCrudos.map((t) => ({
      id: t.id,
      clienteId: t.clientId ?? "",
      inicio: t.startsAt,
      precio: t.priceAtBooking ?? t.service.price,
      pagoLegado: t.payment,
    }));

    const grupos = armarFichas(
      {
        clientas: clientas.slice(0, LIMITE_CLIENTAS),
        proximos,
        completados,
        faltazos: faltazosCrudos.map((f) => f.clientId ?? ""),
        cobros: new Map([...cobros].map(([id, cs]) => [id, cs.map((c) => ({ amount: c.amount, method: c.method }))])),
      },
      permisos,
      ahora,
    );
    return { ok: true, grupos };
  } catch (err) {
    logger.error("buscador", "no se pudo buscar clientas y turnos", err, { largo: texto.length });
    return { ok: false, mensaje: "No pudimos buscar ahora. Probá de nuevo en un momento; si sigue, avisale al dueño." };
  }
}
