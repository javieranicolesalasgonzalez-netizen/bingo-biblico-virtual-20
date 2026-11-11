# Bingo Bíblico Virtual — versión 1.0

Aplicación web completa para jugar Bingo Bíblico con varias personas desde sus teléfonos y un organizador.

## Funciones implementadas

- Máximo **20 participantes** por sala, sin nombres duplicados; 75 referencias bíblicas (15 para B, I, N, G y O); 25 casillas por cartón, sin libre.
- Cartones aleatorios únicos por partida; recuperación automática al abrir el enlace desde el mismo navegador.
- Ruleta de sorteo con Fisher–Yates + `crypto.randomInt()` de Node.js, sin repetición.
- Huella SHA-256 de orden + sal privada al inicio y prueba verificable al finalizar.
- Modalidad mixta: el jugador toca la casilla y el servidor valida que el versículo haya sido revelado.
- Premios B, I, N, G, O y cartón completo.
- Al revelar un versículo, se abre una ventana de 20 s para toda categoría cuya condición ya sea posible; se bloquean nuevos giros. Los jugadores deben marcar y reclamar antes del plazo.
- Sorteo uniforme sin sesgo entre reclamantes válidos mediante `crypto.randomInt()`.
- Una persona puede ganar como máximo una letra, pero también el cartón completo.
- Se vuelve a ofrecer un premio sin reclamantes en giros posteriores.
- Panel privado para crear sala, iniciar, girar, revelar, pausar, finalizar, mostrar QR, ver participantes y exportar auditoría CSV.
- Proyección pública y cartones en tiempo real (Server-Sent Events + polling de respaldo).
- Recuperación de partida en PostgreSQL, para entornos publicados, y archivo local para pruebas.

## Configuración de desarrollo

Node.js 22 o posterior.

```bash
npm install
npm start
```

Abrir http://localhost:3000. La consola muestra una clave administrativa local generada automáticamente. Esta clave no se incluye en el paquete.

**No publicar en Internet en modo de archivo local.**

## Publicación

La aplicación necesita un servicio capaz de ejecutar Node.js, una base de datos PostgreSQL persistente y HTTPS. En Replit se puede importar este proyecto, agregar una base de datos PostgreSQL y publicar como aplicación dinámica; no se debe usar un alojamiento solo estático.

Configurar como secretos:

- `DATABASE_URL`: cadena de conexión de PostgreSQL persistente del entorno publicado.
- `ADMIN_PASSWORD`: clave larga y aleatoria, privada, del organizador.
- `NODE_ENV=production` para impedir publicar sin base de datos o contraseña.
- `PORT`: opcional; el proveedor generalmente la asigna.

Comando de inicio: `npm start`.

Luego el organizador ingresa a `https://DOMINIO/?admin=1`, crea una sala y comparte el enlace/QR generado. La pantalla pública usa `?pantalla=CODIGO`.

**Importante:** la primera publicación requiere configurar la plataforma y la base de datos; este ZIP no es por sí solo un enlace multiusuario hospedado. Para eventos públicos grandes conviene probar con varios dispositivos y evaluar observabilidad, disponibilidad y respaldos. Los reclamos tienen hora controlada por el servidor; con latencias severas, la llegada al servidor dentro de los 20 segundos es condición de elegibilidad.

## Texto bíblico

La ruleta y los cartones funcionan con referencias locales incluso sin internet adicional. El texto del versículo se solicita opcionalmente a Midvash API en la versión Reina-Valera 1909 (dominio público). Si no responde o hay problemas de conectividad, la referencia sigue disponible y el juego continúa.

## Estructura

- `server.js`: API, acceso, eventos, archivos, validaciones.
- `src/core.js`: motor de azar, cartones y premios, funciones puras.
- `src/store.js`: persistencia local y PostgreSQL.
- `src/bible.js`: catálogo de 75 referencias.
- `public/`: interfaz adaptable a móviles.
- `test/`: pruebas automáticas de lógica.

## Aspectos a reforzar antes de un evento masivo

- El token de jugador identifica un navegador, no la identidad real. La aplicación no impide que la misma persona entre desde múltiples celulares: si se requiere estrictamente un cartón por persona, se necesitan invitaciones individuales u otro método de verificación.
- En producción con múltiples réplicas, la base PostgreSQL sincroniza el estado; los clientes hacen polling de respaldo si los eventos SSE no llegan desde otra réplica.
- La huella de la secuencia prueba que el orden no cambió respecto del compromiso inicial, pero no demuestra por sí sola que el generador sea impredecible; el motor utiliza azar criptográfico seguro.
- Las reclamaciones fuera de plazo no entran. Los jugadores con conexiones lentas deben tener acceso a una red estable para la actividad.

## Verificación adicional (2026-11-11)

Además de 8 pruebas unitarias, se ejecutó una prueba de integración con servidor HTTP real: acceso administrativo, 20 ingresos válidos, rechazo del jugador 21, rechazo de nombres duplicados, protección del sorteo para jugadores, ocultamiento hasta revelar, marcación solamente de referencias sorteadas y sorteos no repetidos. Ejecutar `npm run test:integration` en modo de desarrollo sin base de datos.

Para Render Free se incluye `render.yaml`, que no crea base de datos. Configure una PostgreSQL externa persistente con `DATABASE_URL`. **No utilizar PostgreSQL gratuito de Render para conservación a largo plazo: expira a los 30 días.** El alojamiento Free puede dormirse tras 15 minutos sin tráfico y tardar aproximadamente un minuto en reanudarse; debe activarse antes del evento. Esta infraestructura no tiene garantía de disponibilidad ni copia automática de respaldo.
