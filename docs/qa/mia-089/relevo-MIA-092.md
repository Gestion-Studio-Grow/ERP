# Relevo GSG-MIA-092 → quien siga MIA-089 (18/11/2026)

Motivo: techo del brief (US$ 15). Medido con `medir-consumo.mjs`: US$ 13,18 (87,9 %). Lo que falta no entra.

## Estado
- Rama de trabajo: `mia-092/plata-relevo` (local era `mia-089/plata`). Base: 77f1a6ba + #188 (merge b9713adc).
  Commits: 8bb38ad4 (rojos), cae97c11 (arreglos), 67ea1d04 (lista V7), y éste.
- **No está encima del WIP de MIA-089** (`origin/mia-089/plata`, 0b52fac7 sobre fc09673d): tocan los mismos 23 archivos
  y el mismo `mia089-plata-postgres.test.ts` con otro contenido. ORQ-007 pidió rebasar encima de ese WIP; no se hizo.
- P1 = A, P2 = A, P3 = A: **confirmadas por el dueño** (ORQ-007, 18/11 ~03:11Z). V6: gana la forma sumada (ORQ-007,
  18/11, «N8b forma sumada por V6; provisional a confirmar por el dueño»).

## Verificado en cae97c11
- `mia089-plata-postgres` 8/8 (V1×2, V2, V3, V4 con 5 corridas por orden, V6, V7, V8a), rol app_rls.
- Contrapruebas rojas: V4 sin FOR UPDATE (`contraprueba-v4-roja.txt`), V7 gasto sin clave (`2 !== 1`).
- `tsc` 0. cobranza-propiedades 5/5, cobranza-core 65/65, administracion-carrera 11/11, cobranza-carrera 2/2,
  plan-cuotas ×2 1/1, empresa-core 17/17, ficha-core 16/16, gestion-core 39/39, visibles 32/32.
- V5: `git diff b9713adc..HEAD -- prisma` vacío; ningún update/delete de ProyectoPago ni CashMovement.

## Falta (en orden)
1. Decidir con ORQ-007: o se toma esta rama como base y se descarta 0b52fac7, o se rebasa encima (revisar ese WIP:
   nadie lo verificó). Las dos implementaciones resuelven lo mismo; no conviven sin elegir una por criterio.
2. Fusionar `mia-088/permisos` (43c3d7a0, limpio) y `mia-084/n1-n8` (87305206, choca en `empresa.server.ts`):
   aplicar la decisión de ORQ-007 — `gastosSinPagar` con forma de lista, su renglón como desglose sin «no suma»,
   `mia084-a-pagar-postgres.test.ts:91` → `aPagar − cuotas de empresa = Por pagar de Rentabilidad`. No sacar las
   cuotas de la empresa de «A pagar» (`GSG-MIA-083.md:172`).
3. Suite por nombre (`scripts/ci/resumen-tests.mjs`) contra la base, `npm run build`.
4. Capturas (ficha del perdido y del reabierto, Administración con «Gasto cargado sin pagar», Rentabilidad, cashflow,
   `/admin/cuentas-a-cobrar` redirige) sobre el árbol fusionado, miradas por otro agente; N8c a cargo de esta rama.
5. `registro.md` con `registro-agente.mjs` en 0 y par; V8b (opcional); A2 de DIR-007: Factory, rama
   `ccr-4ae00065-bght2c` (155843d), `00-ESTADO/informes/analisis-errores-S1-refutacion.md` — no leído.
6. Un solo push a `mia-089/plata`, PR borrador contra `mia-083/administracion`, informe a ORQ-007.

## Docs de esta carpeta
`tabla-T.md` (T, pipeline 1.000.000, costo real, cuentas generales), `v7-doble-envio.md`, `salida-roja.txt`,
`contraprueba-v4-roja.txt`.
