# El juego de las camisetas — v0.5

PWA del Juego de las Camisetas. React + Vite + Tailwind + localStorage. Sin backend, sin login, todo en el dispositivo del usuario.

## Estructura

```
juego-camisetas/
├── src/
│   ├── App.jsx           # toda la app
│   ├── main.jsx          # entry point + registro de SW
│   └── index.css         # tailwind base
├── public/
│   ├── manifest.webmanifest
│   ├── sw.js             # service worker (offline-first)
│   ├── icon.svg          # icono fuente
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-512-maskable.png
├── index.html
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── package.json
```

## Correr en local

```bash
npm install
npm run dev
```

Abre http://localhost:5173. Tu juego se guarda en `localStorage` del navegador.

## Build de producción

```bash
npm run build
```

Resultado en `dist/`. Listo para subir a cualquier hosting estático.

## Deploy en Cloudflare Pages

### Una sola vez

1. **Crea repo en GitHub.** Ejemplo: `juego-camisetas`. Sube esta carpeta entera (excluyendo `node_modules` y `dist`, ya está el `.gitignore` configurado).

2. **Conecta Cloudflare Pages al repo:**
   - Entra a https://dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git
   - Selecciona tu repo de GitHub
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - Save and Deploy

Tu app queda en `juego-camisetas.pages.dev` (o el nombre que pongas).

3. **Dominio propio (opcional, recomendado):**
   - En Cloudflare Pages → Custom domains → Add custom domain
   - Apunta `juego.dumpa.co` (o el subdominio que prefieras)
   - Si el DNS de `dumpa.co` ya está en Cloudflare, esto toma 30 segundos. Si no, te dirá qué registros añadir.

### Iteraciones siguientes

```bash
git add .
git commit -m "lo que cambió"
git push
```

Cloudflare detecta el push y deploya en ~1 minuto. No necesitas tocar nada más.

## Instalar como PWA en iPhone

1. Abre la URL en **Safari** (no Chrome, en iOS solo Safari instala PWAs)
2. Toca el botón de compartir (cuadrado con flecha hacia arriba)
3. Baja en la lista → **Añadir a pantalla de inicio**
4. Confirma el nombre y toca **Añadir**

La app aparece con su ícono en tu pantalla de inicio, abre en fullscreen sin barra de browser, funciona offline una vez cargada por primera vez.

En Android: Chrome → menú → "Instalar app" (o equivalente). Funciona igual.

## Notas

- **No hay backend.** Los datos viven en el navegador del usuario (`localStorage`). Si el usuario borra cookies del sitio, pierde sus datos. Por eso la app tiene un export/import de JSON en el Diario.
- **Cambiar de dispositivo:** exportar JSON desde un lado, pegarlo en el otro. Es la forma soberana.
- **El service worker** cachea la app para offline. Si actualizas y deployas, la nueva versión se carga la próxima vez que el usuario abre la app conectado.
- **Catálogo de camisetas:** está en `src/App.jsx`, constante `CATALOGO`. Para añadir más camisetas, edita esa constante y haz commit + push.

## Trabajo de autor (no de programador)

Cuando quieras añadir camisetas al catálogo, no necesitas tocar más que el array `CATALOGO` en `App.jsx`. Cada entrada tiene:

```js
{
  id: 'identificador-unico-v1',
  nombre: 'Nombre',
  emoji: '🌱',
  esencia: 'Lema corto.',
  arco: null,                      // o { de: 'X', a: 'Y' }
  precio: 15,                      // en puntos
  creador_id: 'dumpa',
  misiones: [
    { nombre: 'Texto', forma: 'rapida' | 'unica' | 'recurrente', tonos: ['fisica'], puntos_base: 1 },
    // ...
  ],
  milestones: [],                  // opcional
}
```
