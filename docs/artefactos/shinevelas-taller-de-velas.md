# Taller de Velas Shine · juego 3D

Juego web en 3D con la identidad de Shine: paleta del manual 2026 (crema, burdeos, malva), Cormorant + Kumbh Sans, y el logo y la llama oficiales embebidos. Es un solo archivo HTML, sin build: `shinevelas-taller-de-velas.html`.

Versión publicada (privada, se comparte desde el menú de la página): https://claude.ai/artifact/ULY9cKgEWBsJAQeW6ApRo5

Pedido del dueño (16/11/2026): un juego para web o para una experiencia presencial (por ejemplo, un evento de MIA Producciones), con versión táctil y versión PC, donde la dificultad esté en meter la cera en el molde y en desmoldar.

## Qué se juega (5 pasos, 1000 puntos)

| Paso | Desafío | Táctil | PC |
|---|---|---|---|
| Armar | Soltar el pabilo en el centro del molde y trabarlo con el palito centrador | Tocar la pantalla o «Soltar» | `Espacio` o clic |
| Derretir | Mantener la cera entre 75 y 88 °C hasta derretirla; agregar la esencia entre 62 y 72 °C | Mantener «Calor», tocar «Esencia» | Mantener `Espacio` o el clic; `E` |
| Verter | Llenar hasta la línea con una jarra que tiembla, sin volcar afuera | Deslizar para mover la jarra, mantener «Verter» | Mouse o `←` `→`; clic o `Espacio`; `Enter` = listo |
| Enfriar | Pinchar 7 burbujas antes de que la cera se endurezca | Tocar | Clic |
| Desmoldar | Flexionar el molde y tirar sin que la tensión llegue al rojo (3 rajaduras: se parte) | Deslizar ↔ y ↑ | Arrastrar con el mouse, o `←` `→` y `↑` |

- Moldes del catálogo real de Shine: Cilindro texturado (fácil), Corazón y Burbuja (media), Onda (difícil).
- Colores: los 5 de la paleta. Aromas: los 9 de la tienda (`src/tenants/storefront.ts`).
- Al final la vela se exhibe encendida en la bandeja, con puntaje por paso, nivel y un consejo para la próxima.

## Modos (se eligen con el enlace)

- Sin nada: detecta el equipo y marca la opción recomendada como «Este equipo».
- `#tactil` o `#pc`: preselecciona ese modo.
- `#evento`: modo stand. Es táctil, con un único botón «Tocá para empezar». Vuelve solo al inicio tras 75 s sin uso y mantiene la pantalla encendida si el navegador lo permite.
- Ranking: top 10, guardado en el navegador de ese equipo (localStorage). No se comparte entre equipos.

## Cómo sumarlo a una web

- Como página: subir el archivo tal cual (por ejemplo `public/juegos/taller-shine/index.html`) y enlazarlo.
- Embebido: `<iframe src="/juegos/taller-shine/index.html#tactil" style="width:100%;height:100dvh;border:0" allow="fullscreen; autoplay"></iframe>`.
- Necesita internet para Three.js 0.160.0 (cdn.jsdelivr.net) y las fuentes (Google Fonts). No usa APIs pagas ni base de datos.
- Ponerlo en la vidriera de Shine es un deploy a producción: lo decide el dueño. No se hizo.

## QA hecho el 17/11/2026

Un bot jugó como una persona: leía el estado del juego y usaba mouse, teclado o toques táctiles reales (CDP). Corrió en Chromium sin GPU, con el 3D por software (unos 7 cuadros/s), así que el rendimiento real en un equipo con GPU no se midió.

| Equipo | Forma | Recorrido | Resultado |
|---|---|---|---|
| PC 1366×768 | Cilindro malva | Los 5 pasos, ranking guardado | 975/1000; 0 errores de consola |
| PC 1366×768 | Burbuja burdeos | Los 5 pasos (corrida cortada en Desmoldar por el tiempo del test) | Armar 196, Derretir 196, Verter 179, Enfriar 200 |
| PC 1366×768 | Burbuja y Corazón | Desde Desmoldar | 200 cada uno; se dan vuelta bien en la bandeja |
| iPhone 13 vertical, táctil | Corazón rosa | Armar → Enfriar (cortada en Desmoldar por el tiempo del test) | 124 / 199 / 199 / 200 |
| iPhone 13 vertical, táctil | Cilindro burdeos | Desde Enfriar | 200 / 200, final 880 |
| iPhone 13 apaisado, táctil | Onda marfil | Desde Verter | 191 / 200 / 200, final 911 |
| iPhone 13 apaisado, táctil | Corazón nude | Desde Desmoldar | 200 |
| iPad apaisado `#evento` | — | Inicio y diseño | Botón único, modo táctil |
| PC 1920×1080 | Burbuja marfil | Desmoldar tirando sin aflojar | 3 rajaduras, «Se partió», Desmoldar 0 |

Las corridas «desde» un paso usan `shineDebug.jump(...)`, un atajo de QA que deja el taller como si los pasos anteriores estuvieran hechos.

## Pendiente

- Probar en equipos reales: sonido, vibración y fluidez con GPU (celular de gama media y la tablet del stand).
- Un ranking compartido entre equipos necesita persistencia (es gasto): va después de la venta.
- Copy de premios o de la acción del evento: no se inventó; lo define el dueño o el cliente.
