# Break Point Pádel — UAT en producción (Chrome real)

**Cuándo:** después del alta del negocio en la consola (slug `breakpoint`, subdominio `breakpointpadel`).
**Dónde:** `https://breakpointpadel.gsgapp.com.ar` en Chrome real, en escritorio y con el celular emulado
(DevTools → 390 × 844).
**Regla:** es una demo. No hay datos reales ni contraseñas reales, y nada se guarda en la base. No se toca
ninguna configuración de Vercel ni de Neon. **La clave del dueño que mostró el alta no se escribe en ningún lado.**

Cada paso se marca **OK / FALLA / BLOQUEADO**. Cada falla lleva captura, URL, usuario, qué se esperaba y qué pasó.
El resultado va al final de este archivo, en «Resultado».

## 0. Publicación y aislamiento

| # | Paso | Esperado |
|---|---|---|
| 0.1 | Abrir `/` | Portada de Break Point con su logo y sus colores (azul #035BA8, naranja #DC6E22). No es la vidriera genérica «Mi negocio». |
| 0.2 | Abrir `/turnero` y `/club` | Cargan los dos. La consola no muestra errores en rojo. |
| 0.3 | Abrir `https://wpe.gsgapp.com.ar/` y la URL de CH Estética | Están igual que antes: Break Point no se mezcla con otro negocio. |
| 0.4 | Abrir `https://breakpointpadel.gsgapp.com.ar/admin` | Muestra el ingreso del ERP con el nombre de Break Point, o rebota al ingreso. Nunca muestra datos de otro negocio. |
| 0.5 | Abrir `/sitio-estatico/club` desde `wpe.gsgapp.com.ar` | Responde 404: el sitio de Break Point solo se sirve en su propio subdominio. |

## 1. Acceso de los usuarios del club (`/club`)

La demo arranca como **Lu (recepción)**. Los PIN de la demo son Rober 11 y Majo 22 (dueños), y Lu 33 y
Caro 44 (recepción). Para cambiar de usuario: clic en el chip del usuario, elegir, poner el PIN y Entrar.

Matriz que hay que confirmar con **los 4 usuarios** (✔ = lo ve y puede usarlo; ✘ = no lo ve, o el sistema se lo niega):

| Qué | Rober (dueño) | Majo (dueña) | Lu (recep.) | Caro (recep.) |
|---|---|---|---|---|
| Pestañas Agenda, Buffet, Caja, Clientes | ✔ | ✔ | ✔ | ✔ |
| Pestaña Tablero (métricas y cámaras) | ✔ | ✔ | ✘ | ✘ |
| Pestañas Proveedores, Stock, Contenido, Ajustes | ✔ | ✔ | ✘ | ✘ |
| Cobrar cancha, cobrar la parte de un jugador, «a cargo de» | ✔ | ✔ | ✔ | ✔ |
| Cargar en cuentas, − / +, pasar cargo a otra cuenta | ✔ | ✔ | ✔ | ✔ |
| Cargo manual positivo | ✔ | ✔ | ✔ | ✔ |
| Descuento (cargo manual tipo «Descuento») | con su PIN | con su PIN | solo con el PIN de un dueño | solo con el PIN de un dueño |
| Egreso de caja y cierre de caja | con PIN | con PIN | con PIN | con PIN |
| Registrar remito | ✔ | ✔ | ✔ | ✔ |
| Pagar a un proveedor | con PIN | con PIN | ✘ | ✘ |
| Habilitar cuenta corriente de un cliente | ✔ | ✔ | solo pedirla | solo pedirla |
| Falta «Sin cargo (excepción)» | ✔ | ✔ | ✘ | ✘ |
| Ajustes: reglas, horarios, minutos de bloqueo | ✔ | ✔ | ✘ | ✘ |
| Usuarios: PIN nuevo, sacar acceso, aprobar pedidos | ✔ | ✔ | ✘ | ✘ |
| Buscador (Ctrl K): proveedores y productos de stock | ✔ | ✔ | ✘ | ✘ |

Casos de acceso:
- **1.1** PIN equivocado al cambiar de usuario: avisa «PIN incorrecto» y no entra.
- **1.2** «¿Sos nuevo/a? Pedí acceso» con un nombre de prueba. Después, como Rober: Ajustes → el pedido aparece →
  Dar acceso → muestra el PIN una sola vez. Entrar con ese usuario nuevo y ver que tiene permisos de recepción.
  Después, como Rober, sacarle el acceso y comprobar que ya no puede entrar.
- **1.3** Como Rober, «PIN nuevo» para Caro: el PIN viejo deja de andar y el nuevo anda.
- **1.4** Un dueño no puede sacarse el acceso a sí mismo: el botón no aparece en su propia fila.

## 2. Bloqueo de pantalla con PIN propio (en los 4 usuarios)

| # | Paso | Esperado |
|---|---|---|
| 2.1 | Candado del encabezado, o tecla L | «Pantalla bloqueada», con el usuario actual y el fondo borroso. |
| 2.2 | Esc, Ctrl K, N, C, clic afuera | Nada se abre ni se cierra detrás del bloqueo. |
| 2.3 | PIN equivocado 5 veces | «PIN incorrecto (n de 5)» y después 30 s de espera, con el campo deshabilitado. |
| 2.4 | PIN propio | Desbloquea y sigue el mismo usuario. |
| 2.5 | «Entrar con otro usuario» → elegir → su PIN | Entra el otro usuario con **sus** pestañas (ver la matriz). La ventana que había dejado abierta el anterior queda cerrada y no aparece su «Deshacer». |
| 2.6 | Cambiar a otra pestaña de Chrome más de 30 s y volver | Bloqueada («La pantalla se apagó o se cambió de app»). |
| 2.7 | Lo mismo por menos de 30 s | No se bloquea. |
| 2.8 | Ajustes (dueño) → minutos de bloqueo en 1 → no tocar nada 1 a 2 min | Se bloquea por inactividad. Volver el valor a 5. |
| 2.9 | En el celular emulado | El bloqueo entra en la pantalla, el teclado numérico aparece y no hay forma de cerrarlo deslizando. |

Límite conocido de la demo, que no cuenta como falla: recargar la página saltea el bloqueo, porque la demo no tiene login real.

## 3. Los 8 pedidos del 15/10, clic por clic

| # | Paso | Esperado |
|---|---|---|
| 3.1 | Agenda → un turno de 4 jugadores → en un jugador, «A cargo de X» | X pasa a cobrar su parte más la del invitado, y el invitado muestra «$ … → X». No se pueden hacer cadenas, ni poner a alguien a cargo de un jugador que ya pagó. |
| 3.2 | Cobrar a X | «Cobrado $… (incluye la parte de …)». Los dos quedan «✔». |
| 3.3 | Medio «Créditos del cliente» → Cobrar | **Antes** de descontar aparece el panel «¿Usamos los créditos de…?», con monto, saldo y con cuánto queda (y si la seña queda pagada). «No, elegir otro medio» no descuenta nada. |
| 3.4 | Leer la pantalla entera | Dice «cargo», no «consumo» (botón «Abrir cuenta», «Cargos de los jugadores»). |
| 3.5 | Cuenta → «Mesa compleja» → pasar 1 unidad de un cargo a otra cuenta | Se mueve. El desplegable sigue abierto. |
| 3.6 | Cargo manual «Torta» $15.000 | Se suma con la etiqueta «manual». |
| 3.7 | Tipo «Descuento» sin PIN, después con PIN 11 | Primero lo niega; después se aplica. Pasar ese descuento a otra cuenta → lo niega. |
| 3.8 | − / + en un cargo, en la cuenta y en «Cargos de los jugadores» del turno | Suma y resta. No deja la cuenta por debajo de lo pagado. |
| 3.9 | Stock (dueño) | Columnas «Cód. interno» y «Cód. fábrica». Buscar por «bp-002» y por «7790000000028» encuentra el Agua. |
| 3.10 | Stock → «Precios y rentabilidad» → cambiar el «% sobre costo» de un producto | El precio se recalcula (redondeado a $50) y se ve margen, vendidos, facturado y ganancia. Un campo vacío avisa y no guarda. |

## 4. Turnero de jugadores + sincronía con el club

| # | Paso | Esperado |
|---|---|---|
| 4.1 | Pestaña A: `/turnero`. Pestaña B: `/club` | El club muestra «Turnero en vivo». |
| 4.2 | Turnero: entrar con **Google (demo)**. Después, en una ventana de incógnito, **crear cuenta** con celular y contraseña de prueba | Los dos ingresos andan. Una contraseña corta se rechaza. |
| 4.3 | Reservar un horario futuro | En segundos aparece solo en la agenda del club. |
| 4.4 | «Simular comprobante (demo)» | El turno queda firme y el club recibe la novedad. |
| 4.5 | En el club, cargar un turno en un horario libre | Se ocupa en vivo en el turnero. |
| 4.6 | Cerrar la pestaña del turnero que abrió primero y abrir otro | El club sigue «en vivo». |
| 4.7 | WhatsApp | Los links abren WhatsApp **sin número** cargado (en la demo no hay teléfonos reales). |

## 5. Estilos, tema y celular

- Probar los 6 estilos (Chapa, Marcador, Césped, Bodegón, Galpón, Original), en claro y en oscuro, con un vistazo a Agenda,
  a un turno y al bloqueo.
- En el celular emulado (390 px): turnero completo, club como Lu y como Rober, sin desplazamiento horizontal.
- El crédito «Sistema hecho por Gestión Studio Grow» aparece en el pie del club y no en el turnero ni en la portada.

## Resultado

_(lo completa la sesión que corre el UAT: fecha y hora, navegador, una tabla con cada paso y su estado, y los defectos
numerados con captura)_

— Elaborado por GSG
