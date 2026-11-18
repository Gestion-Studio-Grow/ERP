# GSG-MIA-095 · relevo (frené al 92,8 % del techo: US$ 12,99 de 14, medido con `medir-consumo.mjs`)

Rama `mia-095/e1-e4`, desde `tanda/mia-publicacion` c94fa459. Cabeza: el commit de este relevo (sobre 78fcf5ac).

## Hecho
- **E-1:** rojo 9bf68b8b (0/5), arreglo b69ad0a6 (5/5).
  - Derivar al Taller usa el mismo pase entre negocios que asignar, en la transacción de dos fases.
  - Sin vínculo no se crea nada. Una falla a mitad deja 0 filas parciales.
- **E-4:** rojo 71a00c2c (1/3), arreglo 9fa884ac (3/3, entrando con la acción `login` real).
  - Una sola regla por rubro: `RUBROS_CON_SEGUNDO_PASO`.
  - El PIN y Google no se heredan en el Taller: provisional a confirmar por el dueño.
- **Merge de MIA-091 49097278:** 71837ecd. Choque en los imports de `gestion.server.ts:15-17`, aprobado por ORQ-007.
- **Choque semántico A1:** 78fcf5ac. Tres páginas del Taller anotadas con su guarda, igual que PLAT-024.
- **Suite en 9fa884ac:** 10230 ok, 2 rojos, 2 salteados.
  - Aislamiento del pool: pide `ERP_TEST_PG_URL`. Con el Postgres local da 8/8 en la base y en la cabeza.
  - A1: arreglado en 78fcf5ac (5/5).
- **Capturas:** 8, revisadas por el verificador visual (8/8 SÍ). Están en el contenedor de la sesión, no en Git.

## Falta (para quien siga)
1. **Par de repositorio.** Repetir por commit:
   - los rojos en 9bf68b8b y 71a00c2c;
   - los verdes en la cabeza: `derivar-taller-postgres`, `segundo-paso-rubros-postgres`, `matriz-permisos`, `segundo-factor-core`;
   - el control de que cada commit de test no trae el arreglo.

   Después pasar las filas «sin confirmar» del registro a «hecho» con «coincide».
2. **`tsc` y `build` en la cabeza.**
   - `tsc` dio 0 en 9fa884ac.
   - En 78fcf5ac dio 1 error en `.next/dev/types/validator.ts`, archivo generado por el `next dev` de las capturas y cortado al cerrarlo. No es del repo. Se regenera con `npm run build` o borrando sólo `.next/dev` a mano.
   - El `build` quedó corriendo al frenar, sin resultado leído.
3. **PR en borrador contra `tanda/mia-publicacion`.** Borrador del cuerpo (tabla de puertas atadas a `productora`, verificación, fuera de alcance) en el scratchpad de la sesión `pr-body.md`. Hay que sumarle 78fcf5ac.
4. **Informe a ORQ-007.** ≤ 300 palabras.

## Cuidados
- No hay migración ni columna nueva. Nada tocó Neon ni Vercel. El vínculo al Taller en producción no se cargó.
- Tras derivar, el monto del CRM pasa a «sin cargar» a propósito (regla V5: en el ARM no quedan montos), igual que al asignar.
