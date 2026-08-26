# NDS Web Console

Prototipo web responsive inspirado en una consola Nintendo DS: dos pantallas, pantalla inferior táctil y controles físicos simulados para móvil y PC.

## Estado actual

- Interfaz de doble pantalla responsive.
- Pantalla inferior táctil mediante Pointer Events (ratón, stylus y dedo).
- Cruceta, botones A/B y Start/Select en pantalla.
- Teclado en PC.
- Launcher con aplicaciones/módulos.
- `Touch Lab` para probar coordenadas táctiles.
- `Mini Game` como demostración de comunicación entre controles y pantalla superior.
- `System` para visualizar entradas activas.

## Controles PC

| Acción | Tecla |
| --- | --- |
| Dirección | Flechas o WASD |
| A | Z |
| B / volver | X |
| Start | Enter |
| Select | Shift |

En móvil se pueden usar directamente la cruceta y los botones de la consola. La pantalla inferior responde a gestos táctiles.

## Desarrollo local

```bash
npm install
npm run dev
```

Build de producción:

```bash
npm run build
npm run preview
```

## Docker

La imagen usa un build multi-stage: Node compila la aplicación con Vite y Nginx sirve únicamente el contenido generado de `dist`.

Construir y arrancar:

```bash
docker compose up -d --build
```

Por defecto la aplicación queda disponible en:

```text
http://localhost:8092
```

Ver logs:

```bash
docker compose logs -f nds
```

Parar:

```bash
docker compose down
```

El puerto puede cambiarse sin editar el compose:

```bash
NDS_PORT=8080 docker compose up -d --build
```

El contenedor escucha internamente en el puerto `80`. Esto permite poner un Nginx del host, Caddy, Traefik u otro reverse proxy por delante apuntando a `127.0.0.1:8092`.

## Arquitectura prevista

La home actúa como launcher. Cada juego o aplicación se podrá convertir en un módulo con dos vistas coordinadas: `topScreen` y `touchScreen`, recibiendo un estado de controles común. El prototipo actual mantiene todo en `App.tsx` para iterar rápido; cuando añadamos el primer juego real conviene extraer el sistema de input, la carcasa y cada app a componentes independientes.
