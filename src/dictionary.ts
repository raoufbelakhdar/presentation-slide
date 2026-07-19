import { DictionaryEntry, SavedComponent, SceneElement } from './types';
import { generateId } from './utils';

type DictionaryJsonRecord = Record<string, unknown>;

function getStringValue(record: DictionaryJsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function cloneDictionaryElement(element: SceneElement): SceneElement {
  return {
    ...element,
    keyframes: element.keyframes
      ? Object.fromEntries(
          Object.entries(element.keyframes).map(([step, keyframe]) => [
            Number(step),
            { ...keyframe },
          ]),
        )
      : undefined,
  } as SceneElement;
}

function normalizeDictionaryComponent(component: unknown): SavedComponent | null {
  if (!component || typeof component !== 'object') {
    return null;
  }

  const record = component as Partial<SavedComponent>;
  if (
    record.type !== 'saved-element' ||
    typeof record.id !== 'string' ||
    typeof record.name !== 'string' ||
    !record.element
  ) {
    return null;
  }

  return {
    type: 'saved-element',
    id: record.id,
    name: record.name,
    element: cloneDictionaryElement(record.element),
    asset: record.asset ? { ...record.asset } : undefined,
  };
}

export function normalizeDictionaryEntry(entry: unknown): DictionaryEntry | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const record = entry as DictionaryJsonRecord & Partial<DictionaryEntry>;
  const arabicWord = getStringValue(record, [
    'arabicWord',
    'arabic',
    'word',
    'Arabic Word',
    'ArabicWord',
    'arabic_word',
  ]);
  const phonetic = getStringValue(record, ['phonetic', 'Phonetic']);
  const pronunciation = getStringValue(record, [
    'pronunciation',
    'Pronunciation',
    'pronounce',
  ]);

  if (!arabicWord) {
    return null;
  }

  const components = Array.isArray(record.components)
    ? record.components
        .map((component) => normalizeDictionaryComponent(component))
        .filter((component): component is SavedComponent => Boolean(component))
    : [];
  const now = new Date().toISOString();

  return {
    id: typeof record.id === 'string' && record.id ? record.id : generateId(),
    arabicWord,
    phonetic,
    pronunciation,
    components,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now,
  };
}

export function normalizeDictionaryEntries(entries: unknown): DictionaryEntry[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  const normalizedEntries = entries
    .map((entry) => normalizeDictionaryEntry(entry))
    .filter((entry): entry is DictionaryEntry => Boolean(entry));
  const entriesByKey = new Map<string, DictionaryEntry>();

  for (const entry of normalizedEntries) {
    const key = entry.id || entry.arabicWord.toLowerCase();
    entriesByKey.set(key, {
      ...(entriesByKey.get(key) || entry),
      ...entry,
      components: entry.components,
    });
  }

  return Array.from(entriesByKey.values());
}

export function parseDictionaryJson(value: string): DictionaryEntry[] {
  const parsed = JSON.parse(value) as unknown;
  const rawEntries =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray((parsed as DictionaryJsonRecord).words)
      ? (parsed as DictionaryJsonRecord).words
      : parsed;

  return normalizeDictionaryEntries(rawEntries);
}

export function getDictionarySearchText(entry: DictionaryEntry) {
  return [
    entry.arabicWord,
    entry.phonetic,
    entry.pronunciation,
    ...entry.components.flatMap((component) => [
      component.name,
      component.element.type,
      component.element.type === 'text' ? component.element.text : undefined,
      component.element.type === 'image' ? component.asset?.name : undefined,
      component.element.type === 'shape' ? component.element.iconName : undefined,
      component.element.type === 'shape' ? component.element.emojiChar : undefined,
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
