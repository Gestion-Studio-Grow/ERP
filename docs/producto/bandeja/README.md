# Bandeja — encontrar y puntuar profes de pádel por cercanía

Nombre de trabajo, provisional. Encargo del dueño (17/10/2026): una app para **puntuar y encontrar profes de
pádel según su ubicación**, donde los profes trabajan con **la app que hicimos para Matías Consoli** (módulo
`padel-clases`, [README](https://github.com/Gestion-Studio-Grow/ERP/blob/claude/beautiful-keller-5tykrg/docs/tenants/matiasconsoli/README.md)
en la rama `claude/beautiful-keller-5tykrg`, **no mergeada**, migración **sin aplicar**).

Estrategia de venta y precios (propuesta, no adoptada): [`ESTRATEGIA.md`](ESTRATEGIA.md).

## Qué hay hoy: una demo a costo cero

| Pieza | Archivo |
|---|---|
| Pantalla (buscador, ficha, turnero de vista previa, puntuar, «Soy profe») | `public/previews/bandeja/index.html` · `app.mjs` |
| Reglas puras: distancia, puntaje, filtros, reseña verificada, horarios libres | `public/previews/bandeja/motor.mjs` |
| Datos de ejemplo (profes, clubes y reseñas **inventados**; localidades reales) | `public/previews/bandeja/datos.mjs` |
| Pruebas (12) | `src/lib/bandeja/motor.test.ts` |

Sin servidor, sin base, sin login, sin credenciales: nada se guarda ni se envía (ciclo DEMO → VENTA → INVERSIÓN).
Ningún profe real aparece, Matías tampoco: no hay autorización de marca registrada (ADR-034).

**Recorrido que muestra la demo:**
1. **El jugador busca:** elige su localidad y la distancia; filtra por nivel, individual o grupal, precio,
   chicos y reserva online. Ve la lista y un plano de zona sur con los clubes.
2. **Abre una ficha:** dónde da clases, con la distancia a cada club; precios; puntaje con los cuatro
   criterios; las reseñas, con «Clase verificada del 16 oct», la respuesta del profe y «Denunciar reseña».
3. **Reserva:** el mismo turnero de 3 pasos de `padel-clases` (día → hora → nombre y celular). El pedido le
   cae al profe en «Pendientes».
4. **Puntúa:** desde el link del alumno, después de una clase **dada**. Cuatro criterios de 1 a 5 y un comentario
   opcional sin teléfonos, links ni arrobas. Una vez por clase; el link vence a los 30 días.
5. **El profe se suma:** qué incluye, planes provisionales, oferta de fundador y formulario.

## Las reglas (en `motor.mjs`, con pruebas)

- **Distancia:** desde el jugador hasta el **club** donde da clases el profe (nunca su casa). Si da en varios, cuenta el más cerca.
- **Puntaje para ordenar:** promedio bayesiano — `(4,0 × 5 + suma) / (5 + n)`. Con pocas reseñas, el puntaje
  se acerca a 4,0: un profe nuevo con un solo 5 no le gana a uno con veinte 4,8.
- **Una voz por alumno:** cuenta la última reseña de cada alumno. Uno fiel con 40 clases no pesa 40 veces.
- **Recomendados:** puntaje − 0,04 por km. A igual puntaje gana el más cerca; uno mucho mejor puede estar más lejos.
- **Reseña verificada:** la clase existe en la agenda del profe, está DADA, es del alumno que tiene el link, no
  tiene reseña y no pasaron más de 30 días. Si no, un error en castellano que dice qué hacer.

Los valores (4,0 · 5 · 30 días · 0,04) están en `REGLAS` y son **provisionales a calibrar** con datos reales.

## Cómo sería la versión real (cuando se venda; nada de esto está construido)

Va **adentro del ERP**, sobre `padel-clases`, no como app aparte (un solo sistema, muchos negocios).

1. **Reseña** (tabla por negocio, con RLS como las otras 5 de `padel-clases`): `PadelResena` atada a una
   `PadelClase` en estado DADA (única por clase), con los cuatro puntajes, el texto, la respuesta del profe y
   su estado de moderación. Se pide desde el link del alumno que ya existe (`/alumno/<token>`).
2. **Ficha pública** (opt-in del profe): `PadelFichaPublica` — clubes con coordenadas, niveles, precios, bio,
   «publicada sí/no». La carga el profe en «Horarios y precios».
3. **El buscador lee entre negocios, y eso es lo delicado.** Con RLS forzada (`app_rls` NOBYPASSRLS), una
   consulta que cruza negocios no debe saltarse el aislamiento. Propuesta: una **proyección pública**
   (tabla sin datos personales: ficha + resumen de puntaje + reseñas ya moderadas con «Juan P.») que se
   escribe por evento (outbox) cuando el profe publica o llega una reseña, y que el buscador lee con un rol
   de sólo lectura limitado a esa tabla. Nunca leer `PadelClase`, `PadelAlumno` ni `Client` de otro negocio.
   **Esto lo diseña y lo audita la célula de Seguridad antes de construirse.**
4. **Migración:** aditiva, **sin aplicar** hasta que el dueño la autorice (Gate 2), y después de que se aplique la de `padel-clases`.
5. **Legal antes de abrir el buscador:** inscripción de la base en la AAIP, términos y política de reseñas,
   procedimiento de denuncia y baja, qué pasa con las reseñas si un profe se va. Revisión de un abogado.

## Qué NO está hecho (dicho de frente)

1. **Es una demo estática.** No está dentro del ERP ni tiene base, login ni moderación de verdad.
2. **`padel-clases` no está en `main`** y su migración no está aplicada: la versión real depende de eso.
3. **El plano es esquemático** (las posiciones salen de coordenadas reales; las rutas son aproximadas). No hay
   un servicio de mapas, para no gastar ni depender de terceros en la demo.
4. **Sin geolocalización del navegador:** el jugador elige su localidad de una lista de 10 de zona sur.
5. **Lint y build del proyecto no se corrieron en esta sesión** (el árbol no tiene `node_modules`). El cambio
   no toca código que compile Next: es una carpeta en `public/` y un test. Sí se corrieron las 12 pruebas
   (`node --test` con tipos quitados) y `tsc --strict` aislado sobre el test, en cero.
6. **Marca de Bandeja:** tipografía Barlow Condensed (títulos) + Hanken Grotesk (texto, la de la casa),
   azul cancha y amarillo pelota. Es identidad de producto propia, como la de cada negocio; a validar por el dueño.

## Verificación (17/10/2026)

- `motor.test.ts`: 12/12.
- Recorrido en Chromium (Playwright), clic por clic: **29/29** — buscar, filtrar, vacío con salida, ficha,
  reservar con errores y con éxito, Esc cierra, profe sin reserva online, puntuar con errores (sin puntos,
  con teléfono) y con éxito, segunda vez bloqueada, pin del plano, «Soy profe», formulario; a 390 px en claro
  y oscuro sin scroll horizontal; consola sin errores.

— Elaborado por GSG
