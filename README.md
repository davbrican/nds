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

## Desarrollo

```bash
npm install
npm run dev
```

Build de producción:

```bash
npm run build
npm run preview
```

## Arquitectura prevista

La home actúa como launcher. Cada juego o aplicación se podrá convertir en un módulo con dos vistas coordinadas: `topScreen` y `touchScreen`, recibiendo un estado de controles común. El prototipo actual mantiene todo en `App.tsx` para iterar rápido; cuando añadamos el primer juego real conviene extraer el sistema de input, la carcasa y cada app a componentes independientes.
