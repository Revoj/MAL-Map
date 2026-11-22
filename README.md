# ✦ MAL Map v2

Mapa interactivo del universo del anime. Cada estrella es una serie (con todas sus
temporadas, películas y OVAs fusionadas en una sola franquicia) y las series que la
comunidad recomienda entre sí forman **constelaciones**.

> Fork modernizado de [platers/MAL-Map](https://github.com/platers/MAL-Map). Se conserva la
> idea original (constelaciones construidas a partir de recomendaciones, solo obras
> principales) y se reescribe todo con datos y librerías actuales.

## Novedades respecto al original

| | Original (2022) | v2 |
|---|---|---|
| Datos | MAL + AniList, 2022 | AniList (≈9.000 obras, noviembre 2026) + MAL opcional; actualización mensual automática |
| Frontend | Svelte 3, webpack, Pixi 6, SMUI | Svelte 5 (runes), Vite 8, TypeScript, Sigma.js 3 (WebGL) + Graphology |
| Filtros | Apagan nodos | **Reconstruyen el mapa**: se recalculan constelaciones (Louvain) y posiciones (d3-force) solo con las series filtradas, en un Web Worker y con animación. Opción de solo atenuar |
| Tu lista | — | Conecta tu lista de **MyAnimeList** (usuario público), **AniList**, o importa el **XML exportado de MAL** |
| Recomendaciones | — | PageRank personalizado sobre el grafo de recomendaciones, ponderado por tus notas, con explicación («porque viste X, Y») y control *populares ↔ joyas ocultas* |
| Exploración | Búsqueda y ficha | Franquicias por continuar, constelaciones sin explorar, «Sorpréndeme», historial, series similares, colorear por puntuación/año/tu lista, sinopsis y tráiler, foco por constelación |

### Filtros

Año de estreno · puntuación · popularidad (incl. «poco conocidas») · nº de episodios y de
temporadas · géneros (incluir/excluir, «todos» o «alguno») · temas/etiquetas de AniList
(más de 300: isekai, viajes en el tiempo, militar…) · demografía (shounen, seinen…) ·
formato (TV/ONA/corto) · estado (en emisión, finalizado, próximamente) · estudio ·
material original · país · estado en tu lista (no vistas, pendientes…). Además, atajos:
joyas ocultas, clásicos, en emisión, recientes, cortas, no vistas.

## Cómo funciona

1. **`pipeline/fetch-anilist.ts`** descarga las ~9.000 obras más populares de AniList
   (con ID de MAL, relaciones y recomendaciones). Reanudable, respeta el límite de 30 req/min.
2. **`pipeline/fetch-mal.ts`** *(opcional)* añade puntuación, miembros y recomendaciones
   de MyAnimeList, vía la API oficial (`MAL_CLIENT_ID`) o Jikan. Si no hay acceso, se omite.
3. **`pipeline/build.ts`**
   - fusiona cada franquicia siguiendo las relaciones de secuela/precuela (también a través de
     películas intermedias); el nodo es la serie TV/ONA más popular y el resto (películas,
     OVAs, especiales) queda como «obras de la franquicia»;
   - suma las recomendaciones de toda la franquicia y crea aristas ponderadas
     (`votos / total de votos del nodo`, simétrico, como el original);
   - detecta constelaciones (Louvain) y calcula la disposición inicial en dos fases
     (primero las constelaciones, luego las estrellas dentro de cada una).
4. El navegador carga `public/data/anime.json` (~600 KB comprimido) y reutiliza el mismo
   código de layout (`src/lib/core`) en un Web Worker para reconstruir el mapa al filtrar.

La lista pública de MAL se lee con el mismo endpoint que usa la web de MAL. Como MAL no
permite CORS, se necesita un pequeño proxy: en desarrollo lo hace Vite (`/api/mal/<usuario>`)
y en producción la función `api/mal.ts` (Vercel). AniList y la importación del XML funcionan
directamente desde el navegador.

## Desarrollo

Requiere Node ≥ 22.18 (los scripts del pipeline son TypeScript ejecutado directamente por Node).

```bash
npm install
npm run dev          # http://localhost:5173
```

Regenerar los datos:

```bash
npm run data:fetch   # ~7 min (AniList)
npm run data:fetch-mal   # opcional; con MAL_CLIENT_ID=... usa la API oficial de MAL
npm run data:build   # fusiona franquicias, aristas, constelaciones y layout
```

`npm run data:build -- 3000` cambia la popularidad mínima (usuarios en AniList) para incluir
más o menos series.

## Despliegue

- **Vercel** (recomendado): importa el repo; `vercel.json` ya configura el build y la ruta
  `/api/mal/:user`. Todo funciona, incluida la conexión con MAL por nombre de usuario.
- **GitHub Pages**: el workflow `.github/workflows/main.yml` publica la versión estática.
  Para conectar listas de MAL por usuario define la variable de repositorio `MAL_PROXY` con
  la URL de un proxy (p. ej. tu despliegue de Vercel `https://…vercel.app/api/mal`).
- `.github/workflows/update-data.yml` regenera los datos el día 1 de cada mes.

## Estructura

```
pipeline/            descarga y construcción del dataset
server/mal-list.ts   lectura de listas públicas de MAL (proxy)
api/mal.ts           función serverless para producción
src/lib/core/        layout y constelaciones (compartido Node / navegador)
src/lib/             estado (runes), filtros, recomendaciones, motor del mapa (Sigma)
src/components/      interfaz
public/data/         dataset generado
```

## Créditos

Idea y versión original: [platers/MAL-Map](https://github.com/platers/MAL-Map).
Datos: [AniList](https://anilist.co) y [MyAnimeList](https://myanimelist.net). Este proyecto
no está afiliado a ninguno de los dos.
