# CERT-B4 · Caja completa del club (Break Point)

- **Rama:** `n2/b4-caja-club`. Base certificada: `f708522` (`origin/main` `a48c3f0` + merge de `origin/reing-bp-t3c` `9ea994b`, sin conflictos).
- **Riesgo:** plata y concurrencia. El certificador adversarial trabajó sobre el diff, en Opus. `escaladoAFable`: no.
- **Veredicto final: CERTIFICA.** No quedan fallas altas ni medias.

## Vueltas de certificación

| Vuelta | Commit | Veredicto | Hallazgos |
|---|---|---|---|
| 1 | `d4625c6` | NO CERTIFICA | **F1 alta:** un día trabajado por turnos que pasó el mediodía no se podía cerrar. **F2 media:** recepción, con PIN de 2, todavía podía hacer egresos y cierres por el camino viejo. **F3 media:** un conteo hecho sin internet podía aplicarse a otro turno. |
| 2 | `a742be2` | NO CERTIFICA | F1, F2 y F3 cerradas. **F2' media:** el egreso viejo se salteaba el largo de firma si llegaba con un `firmaId` inexistente. |
| 3 | `9b76199` | **CERTIFICA** | F2' cerrada. Los 7 ataques de la vuelta 3 pasan y los 8 de la vuelta 2 también. |

**Después de la certificación**, en `4ea7d89`:

- **Arqueo a ciegas:** recepción ya no ve el importe de los movimientos del turno abierto (`caja-core.ts:157`, `:171`; `CajaDelClub.tsx:148-215`).
- **Nombre del jugador (B4-C5):** la cuenta muestra el campo «Nombre o teléfono de Jugador N», con sugerencias de las fichas.
- **Revisión:** fue liviana, porque el cambio sólo toca la pantalla y una función de vista pura. Los tests de `caja-core` y `cuenta-core` pasan 59/59.

## Verificación

- `tsc --noEmit` en 0.
- Suites `src/lib/club/*.test.ts` y `src/app/admin/(dashboard)/club/*.test.ts`: **732/735**.
- Las 3 fallas son de `cuenta-y-buffet-pantalla.test.ts` (Playwright, *strict mode*: «Lucas Fernández, Cancha» encuentra 2 botones). **Fallan igual en la base `f708522`**: vienen de antes y dependen de la fecha de la demo.

## Criterios

| Criterio | Estado |
|---|---|
| C1 · cierre por turno a ciegas, billetes, motivo, consolidación del día | CUMPLE |
| C2 · corregir medio | CUMPLE |
| C3 · retiro y egresos por categoría | CUMPLE |
| C4 · firma con PIN de 4 | CUMPLE |
| C5 · nombre del jugador | CUMPLE en la UI; obligatorio sólo si `config.caja.pedirNombreJugador` |
| C6 · archivo del día | CUMPLE |
| C7 · sin internet | CUMPLE |
| C8 · evento de caja | PREPARADO |

C8: no existe un canal de eventos en `src/lib`. El comando ya arma `caja.turno.cerrada@1` en su resultado y queda listo para cuando exista B1.

## Observaciones abiertas (bajas o de alcance)

1. **La pantalla vanilla `src/tenants/breakpoint/sitio/club.html` (:7448-7481, :8297-8299) no cumple D-16, y esto es de antes del diff.**
   - Todavía ofrece «Egreso en efectivo» con PIN de 2.
   - Tiene un cierre que muestra lo esperado.
   - `M.egresoCaja` y `M.cerrarCaja` del motor no validan el largo de firma.
   - **Falta decidir el alcance:** alinearla en otra tanda o retirarla.
2. Si en la cola hay un `contarTurno` de antes del deploy, sin `numero` ni `huella`, se aplica la regla vieja (cantidad + medios).
3. Un cierre con MP en espera guarda el PIN en la memoria de la pestaña. Si se recarga, hay que volver a hacerlo.
4. `corregirMedio` no cambia el medio en los pagos de cuentas de cargos (en los pagos del turno, sí). `cobrarParte` no lleva el nombre del jugador.
5. `largoPinFirma` y `pedirNombreJugador` todavía no se configuran desde la pantalla; sólo desde la foto.
6. **Integración:** `motor.mjs` es una copia controlada (`ORIGEN.json` fijado en `d4625c6`). Si otra tanda toca el motor, hay que repetir la copia a la fuente, `empaquetar.mjs` y el sha.
7. Los e2e `ensayo-pase` y `uat` que usan el egreso o el cierre viejos no se corrieron.

## Decisiones del dueño

- **D-16:** la firma lleva PIN de 4 dígitos. Es un valor **provisional, a confirmar con el dueño**, y se configura en `config.caja.largoPinFirma`.
- **Alcance de la pantalla vanilla `club.html`:** ver la observación 1.
