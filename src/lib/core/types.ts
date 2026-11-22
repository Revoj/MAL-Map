/** Obra de una franquicia: [idAniList, idMal (0 si no hay), formato, año (0), título] */
export type Member = [number, number, string, number, string];

/** Un nodo del mapa = una obra principal (serie TV/ONA) con toda su franquicia fusionada. */
export interface AnimeNode {
  id: number; // id AniList de la obra canónica
  mal: number; // id MAL de la obra canónica (0 si no tiene)
  t: string; // título romaji
  en: string | null; // título en inglés
  nat: string | null; // título nativo
  img: string; // portada
  col: string | null; // color dominante de la portada
  f: string; // formato de la obra canónica (TV, TV_SHORT, ONA)
  yr: number | null; // año de inicio de la franquicia
  yr2: number | null; // año de la última temporada principal
  season: string | null;
  ep: number; // episodios sumando temporadas principales
  dur: number | null; // duración por episodio (min)
  seasons: number; // nº de temporadas principales fusionadas
  sc: number | null; // puntuación media AniList (0-100)
  msc: number | null; // puntuación MAL (0-10), si está disponible
  mem: number | null; // miembros en MAL, si está disponible
  pop: number; // popularidad AniList (usuarios con la obra en su lista)
  fav: number;
  st: string; // estado: FINISHED, RELEASING, NOT_YET_RELEASED, ...
  src: string | null; // material original
  cty: string; // país de origen
  g: string[]; // géneros
  tg: [number, number][]; // [índice de etiqueta, relevancia 0-100]
  stu: number[]; // índices de estudios
  m: Member[]; // todas las obras de la franquicia (incluye películas, OVAs...)
  x: number;
  y: number;
  c: number; // constelación precalculada
}

export interface Dataset {
  version: number;
  generated: string;
  sources: string[];
  tags: { name: string; cat: string }[];
  studios: string[];
  nodes: AnimeNode[];
  /** [índice origen, índice destino, peso] */
  edges: [number, number, number][];
}

export interface Constellation {
  id: number;
  name: string;
  hint: string; // obra más popular
  size: number;
  x: number;
  y: number;
  radius: number;
  hue: number;
}
