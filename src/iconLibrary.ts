import { iconNames } from 'lucide-react/dynamic';

export const DEFAULT_ICON_COLOR = '#ffffff';

const KNOWN_ICON_NAMES = Array.from(new Set(iconNames as readonly string[])).sort((a, b) => a.localeCompare(b));
const KNOWN_ICON_NAME_SET = new Set(KNOWN_ICON_NAMES);

const RAW_FEATURED_ICON_NAMES = [
  'accessibility',
  'alarm-clock',
  'badge-check',
  'book-open',
  'brain',
  'briefcase',
  'calendar',
  'chart-column',
  'check',
  'circle-help',
  'clock-3',
  'flask-conical',
  'globe',
  'graduation-cap',
  'heart',
  'lamp',
  'lightbulb',
  'map-pinned',
  'microscope',
  'rocket',
  'search',
  'shield-check',
  'sparkles',
  'star',
  'target',
  'trophy',
  'wand-sparkles',
  'zap',
] as const;

export const LUCIDE_ICON_NAMES = KNOWN_ICON_NAMES;
export const FEATURED_ICON_NAMES = RAW_FEATURED_ICON_NAMES.filter((name) => KNOWN_ICON_NAME_SET.has(name));

function normalizeSearchValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isKnownIconName(name: string) {
  return KNOWN_ICON_NAME_SET.has(name);
}

export function formatIconName(name: string) {
  return name
    .split('-')
    .filter(Boolean)
    .map((part) => {
      if (/^\d+$/.test(part)) {
        return part;
      }

      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

export function searchLucideIcons(query: string, limit = 72) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return FEATURED_ICON_NAMES.slice(0, limit);
  }

  const tokens = normalizedQuery.split(' ').filter(Boolean);

  return KNOWN_ICON_NAMES
    .map((name) => {
      const normalizedName = name.replaceAll('-', ' ');
      const formattedName = formatIconName(name).toLowerCase();
      const haystack = `${name} ${normalizedName} ${formattedName}`;

      if (!tokens.every((token) => haystack.includes(token))) {
        return null;
      }

      let score = 0;

      if (name === normalizedQuery.replaceAll(' ', '-')) score += 400;
      if (normalizedName === normalizedQuery) score += 320;
      if (formattedName === normalizedQuery) score += 300;
      if (name.startsWith(normalizedQuery.replaceAll(' ', '-'))) score += 220;
      if (normalizedName.startsWith(normalizedQuery)) score += 190;
      if (formattedName.startsWith(normalizedQuery)) score += 170;

      score += tokens.reduce((total, token) => {
        if (name.startsWith(token)) return total + 35;
        if (normalizedName.startsWith(token)) return total + 28;
        if (formattedName.includes(token)) return total + 18;
        return total + 10;
      }, 0);

      score -= name.length * 0.02;

      return { name, score };
    })
    .filter((entry): entry is { name: string; score: number } => Boolean(entry))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.name.localeCompare(b.name);
    })
    .slice(0, limit)
    .map((entry) => entry.name);
}
