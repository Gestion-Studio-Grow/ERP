# Magra · 5 ciclos de mejora (back office y front end)

**Orden del dueño:** 10/11/2026 22:44 UTC — «para Magra llevemos 5 ciclos de mejora, back office y front end.
Agarremos lo que está hoy y lo que planificamos y mejorémoslo.»
**Rama:** `claude/fable-magra-ciclos` · **Punto de partida:** `main` en `4ddcd7e` + PR en borrador #120, #122, #123.
**Alcance de esta pasada (14 min, corte duro 22:58 UTC):** auditoría rápida con el mapa de código, plan de 5 ciclos y
los arreglos de front que no tocan plata ni archivos de los PR abiertos.

## 1. Qué se auditó y cómo

- Front: `node .claude/scripts/mapa-codigo.mjs src/app/tienda/magra` (12 archivos, 1 test) + lectura dirigida de
  `MagraTienda.tsx` (bolsa, formulario, barra del celular) y `estilos.ts` (foco, movimiento, áreas de toque).
- Back office: **no se leyó el código**. Pedidos, ajuste por peso, cobro y caja viven en archivos que tocan los PR
  #120/#122/#123 (lista sacada con `git diff --name-only` contra la base). Lo que figura abajo del back office son las
  tres observaciones abiertas que vinieron en el encargo, sin verificación propia.

## 2. Defectos, por prioridad

| # | Dónde | Defecto | Riesgo | Estado |
|---|-------|---------|--------|--------|
| D1 | Back office · alerta de día cerrado (PR #122/#123) | Suma el **total** del pedido y no el **saldo**: un pedido con seña se alerta por de más | Plata | Abierto (viene del encargo, sin verificar) |
| D2 | Webhook de Mercado Pago (PR #122) | Compara lo cobrado contra el **total** y no contra el saldo después del ajuste por peso | Plata | Abierto (ídem) |
| D3 | Ajuste por peso / cobro | Falta el test de **concurrencia en Postgres** (dos ajustes o ajuste + cobro a la vez) | Plata · concurrencia | Abierto (ídem) |
| D4 | `MagraTienda.tsx:836` | El campo WhatsApp no era `type="tel"` ni tenía tope; el ejemplo «11 …» no decía qué formato poner | A11y · criollo | **Arreglado** |
| D5 | `MagraTienda.tsx:840` | La nota del pedido no tenía tope de largo | Robustez | **Arreglado** (300, provisional a confirmar contra el límite del servidor) |
| D6 | `MagraTienda.tsx:693-700` | El − de la bolsa dice «Quitar» aunque sólo baja la cantidad; la cantidad nueva no se anuncia sola (sí el total) | A11y | Abierto → ciclo 2 |
| D7 | `MagraTienda.tsx:430` | El botón de la cinta dice siempre «Pausar la cinta» (con `aria-pressed`); al estar quieta convendría «Reanudar» sin `aria-pressed` | A11y menor | Abierto → ciclo 2 |
| D8 | `MagraTienda.tsx` (1045 líneas, un solo componente cliente) | Bolsa, formulario y carta en un archivo: cuesta testear y carga todo junto | Mantenibilidad · performance | Abierto → ciclo 4 |
| D9 | `estilos.ts:177` | Hex suelto `#6f747a` para el botón deshabilitado (la norma pide tokens) y sin contraste medido | Marca · A11y | Abierto → ciclo 2 |
| D10 | Vidriera | No hay medición reciente de Lighthouse ni capturas en celular/tablet/escritorio de esta versión | Calidad | Abierto → ciclo 1 |

No encontrados en esta pasada (se miraron y están bien): foco visible global (`estilos.ts:355`), `prefers-reduced-motion`
(`:351`), áreas de toque ≥ 48 px, `alt` y dimensiones en imágenes, estrellas con texto para lector de pantalla,
`idempotencyKey` en el formulario.

## 3. Plan de 5 ciclos

Cada ciclo: 1 constructor (Opus alto) + certificación adversarial sólo si toca plata. Un ciclo se cierra con su
criterio cumplido, CI verde y push a su rama.

| Ciclo | Frente | Qué | Criterio de aceptación |
|-------|--------|-----|------------------------|
| **1** | Plata · back office | Cerrar D1, D2 y D3 **sobre los PR #122/#123** (no en rama nueva) | Test rojo→verde por cada uno: alerta de día cerrado con seña usa el saldo; webhook con ajuste por peso compara contra saldo; test Postgres con dos transacciones en simultáneo que no duplica cobro ni devolución. Certificador sin hallazgos. |
| **1b** | Medición (en paralelo, sin código) | Línea de base de la vidriera | Lighthouse en celular (performance ≥ 90, accesibilidad ≥ 95, LCP < 2,5 s, CLS 0) y capturas en 3 anchos, anotadas en este archivo. |
| **2** | Front · accesibilidad y criollo | D6, D7, D9 + recorrido completo con teclado y lector de pantalla | Recorrido «elegir corte → bolsa → enviar» sin mouse; cantidad anunciada una sola vez; cero hex sueltos en las líneas tocadas; `magra.test.ts` verde. |
| **3** | Back office · operación del día | Recorrido clic por clic de pedidos → ajuste por peso → cobro → caja con los PR integrados; textos y estados vacíos en criollo | QA del agente `qa` sin callejones sin salida; cada pantalla dice qué hacer cuando no hay pedidos, cuando falta pesar y cuando el día está cerrado. |
| **4** | Front · estructura y carga | Partir `MagraTienda.tsx` (bolsa y formulario aparte, carga diferida del diálogo) sin cambiar comportamiento | Mismos 15/15 tests + tests nuevos de la bolsa; JS inicial de la vidriera menor que la línea de base del ciclo 1b; Lighthouse no baja. |
| **5** | Cierre · punta a punta | Pedido real de prueba: vidriera → WhatsApp/MP → armado con peso real → cobro del saldo → caja → nota de crédito por peso | Guion de demo de 5 minutos que corre sin intervención; Gate de Excelencia completo; datos de prueba limpiados. |

## 4. Decisiones para el dueño (con opción recomendada)

1. **¿Dónde se arreglan D1–D3?** Recomendado: **sobre los PR #122/#123 antes de publicarlos** (no se publica plata con
   observaciones abiertas). Alternativa: publicar y arreglar después — no recomendado.
2. **Orden de publicación.** Recomendado: **#120 → #122 → #123, uno a la vez**, y recién después los ciclos 2 y 4 de
   front, para no chocar con `GraciasMagra.tsx` y `storefront.ts`, que esos PR tocan.
3. **Tope de la nota del pedido (300).** Recomendado: **dejarlo** y alinearlo con el servidor en el ciclo 2. Provisional
   a confirmar.

## 5. Hecho en esta pasada

- `src/app/tienda/magra/MagraTienda.tsx`: campo WhatsApp con `type="tel"`, `maxLength={30}` y ejemplo «11 2345 6789»;
  nota con `maxLength={300}`.
- Verificación: `magra.test.ts` 15/15. `npx tsc --noEmit` (con 6 GB de heap; con el de fábrica se queda sin memoria): 0 errores en el área; 2 errores previos y ajenos en `src/lib/operador/db-de-scripts.ts:132-133` (módulos de Neon sin instalar en este contenedor).
- QA clic por clic (pendiente de correr en navegador): abrir la bolsa con un corte → el campo WhatsApp muestra el
  ejemplo y en celular abre el teclado de teléfono → pegar una nota de más de 300 caracteres corta en 300 → enviar
  sigue funcionando.
- No se tocó: ningún archivo de los PR #120/#122/#123/#125/#126, plata, Neon, secretos ni dependencias.
