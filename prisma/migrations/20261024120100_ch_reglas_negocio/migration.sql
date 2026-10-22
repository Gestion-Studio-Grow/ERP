-- Reingeniería CH, Tanda 3 · M2 — reglas del mostrador en «Mi negocio» (CH-035, CH-053, CH-068).
--
-- Seis columnas en "BusinessSettings" (una fila por negocio, `tenantId` único, ya con RLS):
--   · aliasSenia / cbuSenia  → a dónde transfiere la clienta la seña (va en el WhatsApp armado).
--   · cancelacionHoras (24)  → con cuánta anticipación tiene que avisar para que la seña vuelva.
--   · seniaCancelaTarde / seniaNoVino ('retener') → qué se PROPONE hacer con la seña cuando avisa
--     tarde o no viene: retener | devolver | a-favor. La recepción siempre puede cambiarlo.
--   · topeBajaSaldoRecepcion (0) → hasta cuánto puede dar de baja un saldo la recepción (D5: $0,
--     sólo la dueña).
-- Los defaults son el placeholder D2/D5 del diseño (provisional a confirmar con el dueño).
--
-- Aditiva: sólo ADD COLUMN, todas nullable o con default constante. En Postgres ≥ 11 un ADD
-- COLUMN con default constante es un cambio de catálogo (no reescribe la tabla ni toca filas).
-- Ningún dato existente cambia: las filas actuales leen los defaults.
-- Mientras NO esté aplicada, el cliente de Prisma no pide estas columnas (omit global,
-- src/lib/prisma-omit.ts), no las nombra en un INSERT (los defaults van como `dbgenerated` en el
-- schema) y `leerReglasDelNegocio` (src/lib/settings.ts) cae a los defaults.
--
-- SIN APLICAR en Neon y fuera de prisma/lote-deploy.txt: la aplica el dueño (Gate 2).

-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "aliasSenia" TEXT,
ADD COLUMN     "cancelacionHoras" INTEGER DEFAULT 24,
ADD COLUMN     "cbuSenia" TEXT,
ADD COLUMN     "seniaCancelaTarde" TEXT DEFAULT 'retener',
ADD COLUMN     "seniaNoVino" TEXT DEFAULT 'retener',
ADD COLUMN     "topeBajaSaldoRecepcion" DECIMAL(14,2) NOT NULL DEFAULT 0;
