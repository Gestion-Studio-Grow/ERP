// ============================================================================
// COLUMNAS ESCRITAS PERO TODAVÍA NO APLICADAS — el cliente de Prisma no las pide.
// ============================================================================
//
// POR QUÉ EXISTE. Cuando `schema.prisma` declara una columna escalar, Prisma la pide en TODA
// consulta que no tenga `select`: `findMany`, `findUnique`, y también el `RETURNING` de cada
// `create`/`update`/`upsert`. Si la migración que la crea no está aplicada en la base, esas
// consultas fallan con P2022 («column does not exist»). La reingeniería de CH (Tanda 3) suma
// `Appointment.groupId` y seis columnas de reglas en `BusinessSettings` con migraciones ESCRITAS
// y SIN APLICAR (Gate 2: las aplica el dueño). Sin este archivo, el día que el código llegue a
// una base sin esas migraciones, la agenda entera (cada consulta a Appointment) y la Localización
// del sitio dejan de andar.
//
// QUÉ HACE. El cliente de la app (`prisma-base.ts`) y el de la consola (`operator-db.ts`) se arman
// con `omit: OMITIR_HASTA_MIGRAR`: estas columnas NO se piden por defecto. El código que las
// necesita las pide a propósito (`select: { groupId: true }`) y tolera que falten
// (`isColumnMissing`, src/lib/prisma-errors.ts), como hace `leerReglasDelNegocio` en
// src/lib/settings.ts.
//
// TIPOS. Los clientes se siguen tipando como `PrismaClient` a secas (sin el omit en el tipo), para
// no cambiar la firma de cada `tx` del repo. Consecuencia: TypeScript cree que una consulta común
// trae `groupId`, y en tiempo de ejecución viene `undefined`. Por eso: estas columnas se leen SÓLO
// con `select` explícito. Nadie las lee hoy fuera de settings.ts.
//
// CUÁNDO SE VACÍA. Cuando el dueño aplique la migración en producción (y `lote-deploy.txt` lo
// registre), la entrada correspondiente se puede sacar de acá. Dejarla no rompe nada: sólo obliga
// a pedir la columna con `select`.
//
// Valores que no son columnas (el enum `PaymentMethod` con DEBITO/CREDITO, M1) no se omiten: leer
// un enum que el cliente conoce de más no falla; lo que falla es ESCRIBIR un valor que la base no
// tiene, y eso lo frena `mediosDePagoHabilitados` + `medioHabilitado` (src/lib/turnos/).

import type { Prisma } from "@/generated/prisma/client";

export const OMITIR_HASTA_MIGRAR = {
  // M3 · 20261024120200_ch_appointment_items
  appointment: { groupId: true },
  // M2 · 20261024120100_ch_reglas_negocio
  businessSettings: {
    aliasSenia: true,
    cbuSenia: true,
    cancelacionHoras: true,
    seniaCancelaTarde: true,
    seniaNoVino: true,
    topeBajaSaldoRecepcion: true,
  },
} as const satisfies Prisma.GlobalOmitConfig;
