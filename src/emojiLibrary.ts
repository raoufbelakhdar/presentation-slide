import openmojiEntries from 'openmoji/data/openmoji.json';

export type OpenMojiEntry = import('openmoji/data/openmoji.json').OpenMojiEntry;

const RAW_FEATURED_OPENMOJI_HEXCODES = [
  '1F600',
  '1F389',
  '2728',
  '1F680',
  '1F4A1',
  '1F4DA',
  '1F4BB',
  '1F3AF',
  '1F3A8',
  '1F9E0',
  '1F525',
  '1F44D',
  '1F44F',
  '1F4CC',
  '1F984',
  '1F31F',
] as const;

const openMojiSvgLoaders = import.meta.glob('/node_modules/openmoji/src/**/*.svg', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

const svgLoaderByHexcode = new Map(
  Object.entries(openMojiSvgLoaders).map(([path, loader]) => {
    const hexcode = path.split('/').pop()?.replace(/\.svg$/i, '') || '';
    return [hexcode.toUpperCase(), loader] as const;
  }),
);

const svgDataUrlCache = new Map<string, string>();
const svgPromiseCache = new Map<string, Promise<string | null>>();

const OPENMOJI_ENTRIES = Array.from(
  new Map(
    openmojiEntries
      .filter((entry) => entry.hexcode && entry.annotation && svgLoaderByHexcode.has(entry.hexcode.toUpperCase()))
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((entry) => [entry.hexcode.toUpperCase(), { ...entry, hexcode: entry.hexcode.toUpperCase() }]),
  ).values(),
);

const OPENMOJI_BY_HEXCODE = new Map(OPENMOJI_ENTRIES.map((entry) => [entry.hexcode, entry]));
const FEATURED_HEXCODE_SET = new Set<string>(RAW_FEATURED_OPENMOJI_HEXCODES);

export const OPENMOJI_EMOJIS = OPENMOJI_ENTRIES;
export const FEATURED_OPENMOJI_HEXCODES = RAW_FEATURED_OPENMOJI_HEXCODES.filter((hexcode) => OPENMOJI_BY_HEXCODE.has(hexcode));

function normalizeSearchValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function getOpenMojiByHexcode(hexcode: string) {
  return OPENMOJI_BY_HEXCODE.get(hexcode.toUpperCase()) || null;
}

export function getOpenMojiLabel(entry: Pick<OpenMojiEntry, 'emoji' | 'annotation'>) {
  return `${entry.emoji} ${entry.annotation}`;
}

export async function getOpenMojiDataUrl(hexcode: string) {
  const normalizedHexcode = hexcode.toUpperCase();
  const cached = svgDataUrlCache.get(normalizedHexcode);
  if (cached) {
    return cached;
  }

  const existingPromise = svgPromiseCache.get(normalizedHexcode);
  if (existingPromise) {
    return existingPromise;
  }

  const loader = svgLoaderByHexcode.get(normalizedHexcode);
  if (!loader) {
    return null;
  }

  const promise = loader()
    .then((svg) => {
      const dataUrl = svgToDataUrl(svg);
      svgDataUrlCache.set(normalizedHexcode, dataUrl);
      return dataUrl;
    })
    .catch(() => null)
    .finally(() => {
      svgPromiseCache.delete(normalizedHexcode);
    });

  svgPromiseCache.set(normalizedHexcode, promise);
  return promise;
}

export function searchOpenMojis(query: string, limit = 72) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return FEATURED_OPENMOJI_HEXCODES
      .map((hexcode) => OPENMOJI_BY_HEXCODE.get(hexcode))
      .filter((entry): entry is OpenMojiEntry => Boolean(entry))
      .slice(0, limit);
  }

  const tokens = normalizedQuery.split(' ').filter(Boolean);

  return OPENMOJI_ENTRIES
    .map((entry) => {
      const searchableText = [
        entry.emoji,
        entry.annotation,
        entry.hexcode,
        entry.group,
        entry.subgroups,
        entry.tags || '',
        entry.openmoji_tags || '',
      ]
        .join(' ')
        .toLowerCase();

      if (!tokens.every((token) => searchableText.includes(token))) {
        return null;
      }

      let score = 0;
      const annotation = entry.annotation.toLowerCase();
      const group = entry.group.toLowerCase();
      const subgroup = entry.subgroups.toLowerCase();
      const hexcode = entry.hexcode.toLowerCase();

      if (annotation === normalizedQuery) score += 360;
      if (annotation.startsWith(normalizedQuery)) score += 240;
      if (subgroup.startsWith(normalizedQuery)) score += 200;
      if (group.startsWith(normalizedQuery)) score += 160;
      if (hexcode === normalizedQuery.replaceAll(' ', '-')) score += 180;
      if (FEATURED_HEXCODE_SET.has(entry.hexcode)) score += 12;

      score += tokens.reduce((total, token) => {
        if (annotation.startsWith(token)) return total + 36;
        if (annotation.includes(token)) return total + 20;
        if (subgroup.includes(token)) return total + 16;
        if (group.includes(token)) return total + 14;
        if (hexcode.includes(token)) return total + 10;
        return total + 6;
      }, 0);

      return { entry, score };
    })
    .filter((result): result is { entry: OpenMojiEntry; score: number } => Boolean(result))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return (a.entry.order || 0) - (b.entry.order || 0);
    })
    .slice(0, limit)
    .map((result) => result.entry);
}
