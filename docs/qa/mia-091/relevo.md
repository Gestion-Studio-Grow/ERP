# GSG-MIA-091 · relevo (18/11)

Frenado al 86 % del techo de gasto (US$ 18,93 de 22) por orden de ORQ-007 (04:12Z). Rama `mia-088/permisos`, base
`mia-083/administracion` 77f1a6ba + #188 (87e8f1e9). Registro: `docs/qa/mia-088/registro.md` (`registro-agente.mjs` 0:
hecho 19 · sin confirmar 6 · escalado 3).

## Hecho (primer padre desde 77f1a6ba)

| Commit | Qué |
|---|---|
| 89b7a5cf → 70a5471f, 9388406c, a0e97f39, 43c3d7a0 | WIP de MIA-088: P1–P7 y Lote 2 (P9–P11), rojo antes y verde después (filas 1–19 del registro) |
| 7769c0e2 | Merge de #188, sin choques; los 27 archivos de test de #188 337/337 sobre la unión |
| f5704da5 | A1 (rol × módulo): `matrizDePermisos` en `src/lib/proyectos/gestion-core.ts:761`; test `gestion-core-matriz.test.ts` 3/3 |
| d44f9775 | A1 (recorrido y lint): `src/lib/proyectos/matriz-permisos.ts:23` (128 acciones), `:155` (32 pantallas), `dejaPasar` `:194`, `recorridoDeLaMatriz` `:214`; test `matriz-permisos.test.ts` 5/5 (la mutación lo pone rojo). Se corrigieron 4 puertas de pantalla: `/nuevo`, `/proveedores/nuevo`, `/proveedores/[id]/editar`, `/propuesta-ia` |
| 36a72315 → 5b0e7566 | H1 y H2 (los encontró el par B): `esCuentaDuenia` `acciones-gestion.ts:190`; `guardarPersona` `:225`; `cambiarEstadoPersona` `:264`. Test `mia091-cuenta-owner-postgres.test.ts` 1/1, rojo en 36a72315 y verde en 5b0e7566 |

Las preguntas 1-A y 2-A quedaron confirmadas por el dueño y se sacó la marca de provisional. La 3 (PRY-013) sigue abierta.

## Verificación en 5b0e7566

- **Suite completa por nombre** (`resumen-tests.mjs`, Postgres local, `app_rls`):
  - Cabeza: 10047/10050, con 1 rojo de tiempo: «medición: una acción con el almacén…». Corrido solo da 14/14, tres veces.
  - Base 6cd20a09: 10027/10029, 0 rojos.
  - Los 2 salteados son los mismos por nombre en las dos.
- `tsc --noEmit` 0. `next build` 0 (en un árbol aparte con `node_modules` real: turbopack no acepta el enlace simbólico).
- `prisma/`: 0 commits propios. Sin secretos ni datos de clientes.

## Falta (sesión corta que sigue)

1. **Capturas.** Son 8 casos a 390 y a 1280 px:
   - A1 y D1: Equipo › Permisos, con Administración y con la dueña.
   - A2 y A3: `/reportes` con Comercial y `/config` con Administración.
   - D2 y D3: las mismas dos pantallas, con la dueña.
   - A4 y D4: Liquidaciones, con Administración en «ver» y con la dueña.

   Las mira un verificador aparte. Después, las filas 5, 9 y 19 del registro pasan a «hecho».

   Montaje: una base de demo local, `next dev --webpack`, con `ERP_TEST_PG_URL`.
2. **Certificación adversarial** del diff f5704da5..5b0e7566 (A1 + H1/H2). Cierra las filas 25 a 27.
3. **PR borrador** contra `mia-083/administracion`:
   - Completar `docs/qa/mia-088/pr-borrador.md`, en las líneas 67–68, 69, 74 y 104. Las marcas a reemplazar son «VERDE», «SUITE», «BUILD», «P188», «ROJO» y «TSC».
   - Cambiar PLAT-023 por PLAT-024.
   - Marcar 1-A y 2-A como confirmadas.
4. **Ramas hermanas** (para PLAT-024): no se unieron a esta rama porque son trabajo en curso.
   - `mia-089/plata` (0b52fac7) entra limpia.
   - `mia-084/n1-n8` (87305206) choca en dos archivos:
     - `acciones-gestion.ts`: se queda con PRY-100 y con G4p a la vez.
     - `empresa.server.ts`: 089 y 084 se contradicen en gastos sin pagar, y no es de esta rama.
5. Fuera de alcance: P8 (otra sesión) y PRY-013.

Diferencias con el informe cruzado: el calendario por token devuelve `null` para SIN_FICHA, y `pagaLiquidaciones` recibe un
`Permiso`, no un rol.
