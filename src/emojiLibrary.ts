import openmojiEntries from 'openmoji/data/openmoji.json';

type OpenMojiEntry = import('openmoji/data/openmoji.json').OpenMojiEntry;

export interface EmojiEntry {
  id: string;
  label: string;
  emoji?: string;
  legacyHexcodes: string[];
  searchText: string;
}

const RAW_FEATURED_EMOJI_IDS = [
  'grinning-face',
  'party-popper',
  'sparkles',
  'rocket',
  'light-bulb',
  'books',
  'laptop',
  'bullseye',
  'artist-palette',
  'brain',
  'fire',
  'thumbs-up-default',
  'clapping-hands-default',
  'pushpin',
  'unicorn',
  'glowing-star',
] as const;

const fluentEmojiAssetLoaders = import.meta.glob(
  '/node_modules/fluentui-emoji/icons/flat/*.svg',
  {
    import: 'default',
  },
) as Record<string, () => Promise<string>>;

function normalizeEmojiId(value: string) {
  return value.trim().toLowerCase().replace(/_/g, '-');
}

function normalizeSearchValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugifyLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function formatEmojiName(id: string) {
  return id
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

const openMojiBySlug = openmojiEntries.reduce((map, entry) => {
  const annotation = entry.annotation?.trim();
  if (!annotation) {
    return map;
  }

  const slug = slugifyLabel(annotation);
  const matches = map.get(slug) || [];
  matches.push({ ...entry, hexcode: entry.hexcode.toUpperCase() });
  map.set(slug, matches);
  return map;
}, new Map<string, OpenMojiEntry[]>());

const EMOJI_ASSET_LOADERS = new Map<string, () => Promise<string>>();
const EMOJI_ASSET_URL_CACHE = new Map<string, Promise<string | null>>();
const EMOJI_ASSET_URL_VALUE_CACHE = new Map<string, string | null>();

const emojiEntries = Object.entries(fluentEmojiAssetLoaders)
  .map(([path, loadAssetUrl]) => {
    const id = normalizeEmojiId(path.split('/').pop()?.replace(/\.svg$/i, '') || '');
    EMOJI_ASSET_LOADERS.set(id, loadAssetUrl);
    const legacyMatches = openMojiBySlug.get(id) || [];
    const primaryLegacyMatch = legacyMatches[0];
    const label = formatEmojiName(id);
    const searchParts = new Set<string>([
      id,
      id.replaceAll('-', ' '),
      label.toLowerCase(),
      ...(primaryLegacyMatch?.annotation ? [primaryLegacyMatch.annotation.toLowerCase()] : []),
      ...legacyMatches.flatMap((entry) => [entry.tags || '', entry.openmoji_tags || '', entry.group, entry.subgroups]),
    ]);

    return {
      id,
      label,
      emoji: primaryLegacyMatch?.emoji,
      legacyHexcodes: Array.from(new Set(legacyMatches.map((entry) => entry.hexcode.toUpperCase()))),
      searchText: Array.from(searchParts).join(' ').toLowerCase(),
      order: primaryLegacyMatch?.order ?? Number.MAX_SAFE_INTEGER,
    };
  })
  .sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }

    return a.label.localeCompare(b.label);
  });

const EMOJI_BY_ID = new Map<string, EmojiEntry>(emojiEntries.map(({ order: _order, ...entry }) => [entry.id, entry]));
const LEGACY_HEXCODE_TO_ID = new Map<string, string>();

emojiEntries.forEach((entry) => {
  entry.legacyHexcodes.forEach((hexcode) => {
    if (!LEGACY_HEXCODE_TO_ID.has(hexcode)) {
      LEGACY_HEXCODE_TO_ID.set(hexcode, entry.id);
    }
  });
});

function resolveEmojiId(id: string) {
  const normalizedId = normalizeEmojiId(id);
  if (EMOJI_BY_ID.has(normalizedId)) {
    return normalizedId;
  }

  return LEGACY_HEXCODE_TO_ID.get(id.trim().toUpperCase()) || null;
}

export const EMOJI_LIBRARY = Array.from(EMOJI_BY_ID.values());
export const FEATURED_EMOJI_IDS = RAW_FEATURED_EMOJI_IDS.filter((id) => EMOJI_BY_ID.has(id));

export function getEmojiById(id: string) {
  const resolvedId = resolveEmojiId(id);
  return resolvedId ? EMOJI_BY_ID.get(resolvedId) || null : null;
}

export function getCachedEmojiAssetUrl(id: string) {
  const resolvedId = resolveEmojiId(id);
  return resolvedId ? EMOJI_ASSET_URL_VALUE_CACHE.get(resolvedId) : undefined;
}

export async function loadEmojiAssetUrl(id: string) {
  const resolvedId = resolveEmojiId(id);
  if (!resolvedId) {
    return null;
  }

  if (EMOJI_ASSET_URL_VALUE_CACHE.has(resolvedId)) {
    return EMOJI_ASSET_URL_VALUE_CACHE.get(resolvedId) || null;
  }

  const existingRequest = EMOJI_ASSET_URL_CACHE.get(resolvedId);
  if (existingRequest) {
    return existingRequest;
  }

  const loadAssetUrl = EMOJI_ASSET_LOADERS.get(resolvedId);
  if (!loadAssetUrl) {
    return null;
  }

  const assetRequest = loadAssetUrl()
    .then((assetUrl) => assetUrl || null)
    .catch(() => null)
    .then((assetUrl) => {
      EMOJI_ASSET_URL_VALUE_CACHE.set(resolvedId, assetUrl);
      return assetUrl;
    });

  EMOJI_ASSET_URL_CACHE.set(resolvedId, assetRequest);
  return assetRequest;
}

export function getEmojiLabel(entry: Pick<EmojiEntry, 'label' | 'emoji'>) {
  return entry.emoji ? `${entry.emoji} ${entry.label}` : entry.label;
}

export function searchEmojis(query: string, limit = 72) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return FEATURED_EMOJI_IDS
      .map((id) => EMOJI_BY_ID.get(id))
      .filter((entry): entry is EmojiEntry => Boolean(entry))
      .slice(0, limit);
  }

  const tokens = normalizedQuery.split(' ').filter(Boolean);

  return EMOJI_LIBRARY
    .map((entry) => {
      if (!tokens.every((token) => entry.searchText.includes(token))) {
        return null;
      }

      let score = 0;
      const normalizedId = entry.id;
      const normalizedLabel = entry.label.toLowerCase();

      if (normalizedId === normalizedQuery.replaceAll(' ', '-')) score += 320;
      if (normalizedLabel === normalizedQuery) score += 280;
      if (normalizedId.startsWith(normalizedQuery.replaceAll(' ', '-'))) score += 220;
      if (normalizedLabel.startsWith(normalizedQuery)) score += 200;
      if (entry.id.endsWith('-default')) score += 24;
      if (FEATURED_EMOJI_IDS.includes(entry.id as (typeof RAW_FEATURED_EMOJI_IDS)[number])) score += 12;

      score += tokens.reduce((total, token) => {
        if (normalizedLabel.startsWith(token)) return total + 36;
        if (normalizedLabel.includes(token)) return total + 22;
        if (normalizedId.includes(token)) return total + 18;
        return total + 8;
      }, 0);

      return { entry, score };
    })
    .filter((result): result is { entry: EmojiEntry; score: number } => Boolean(result))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.entry.label.localeCompare(b.entry.label);
    })
    .slice(0, limit)
    .map((result) => result.entry);
}
