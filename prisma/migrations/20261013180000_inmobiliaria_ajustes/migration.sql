-- Módulo INMOBILIARIA, segunda: cierre de los defectos de plata de la revisión del 13/10/2026
-- (docs/tenants/inmobiliaria/README.md, "Defectos conocidos").
-- Aditiva: sólo agrega columnas con default a dos tablas del módulo. No crea tablas (el RLS de
-- "InmoCuota" e "InmoFoto" ya viene de 20261013120000_modulo_inmobiliaria), no cambia ni borra
-- nada y no toca tablas de otros módulos.

-- AlterTable — lo liquidado por rubro (alquiler, extras, mora) y la marca de mora perdonada.
-- `liquidado` sigue siendo el total. Las cuotas que ya tenían algo liquidado quedan con los
-- tres rubros en 0: el código las reconoce y reparte el total con la regla de imputación.
ALTER TABLE "InmoCuota" ADD COLUMN     "liquidadoAlquiler" DECIMAL(14,2) NOT NULL DEFAULT 0,
                        ADD COLUMN     "liquidadoExtras" DECIMAL(14,2) NOT NULL DEFAULT 0,
                        ADD COLUMN     "liquidadoPunitorios" DECIMAL(14,2) NOT NULL DEFAULT 0,
                        ADD COLUMN     "moraPerdonada" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable — marca de "la url es un data URL": los listados no leen más la foto entera.
ALTER TABLE "InmoFoto" ADD COLUMN     "esData" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: las fotos ya guardadas como data URL llevan la marca.
UPDATE "InmoFoto" SET "esData" = true WHERE "url" LIKE 'data:%';
