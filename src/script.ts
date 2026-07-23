import {
  Asset,
  DEFAULT_SEQUENCE_ANIMATION_TYPE,
  DEFAULT_SEQUENCE_DELAY,
  DEFAULT_SEQUENCE_DURATION,
  Scene,
  SceneElement,
  ScriptDefinition,
  ScriptLayout,
  ScriptWord,
  ScriptWordAssociation,
  TextElement,
} from './types';
import { DEFAULT_ICON_COLOR } from './iconLibrary';
import {
  DEFAULT_TEXT_BLOCK_BACKGROUND_COLOR,
  DEFAULT_TEXT_BLOCK_FONT_SIZE,
  DEFAULT_TEXT_BLOCK_PADDING,
  DEFAULT_TEXT_BLOCK_SUBTITLE_FONT_SIZE,
  generateId,
  getTextBlockFitSize,
} from './utils';

const SCRIPT_STORAGE_KEY = 'visual-learning-scripts-v1';

export function tokenizeScript(text: string): string[] {
  return text.trim().match(/\S+/gu) || [];
}

export function reconcileScriptWords(text: string, previous: ScriptWord[] = []): ScriptWord[] {
  const availableByText = new Map<string, ScriptWord[]>();
  previous.forEach((word) => {
    const key = word.text.toLocaleLowerCase();
    availableByText.set(key, [...(availableByText.get(key) || []), word]);
  });

  return tokenizeScript(text).map((token) => {
    const key = token.toLocaleLowerCase();
    const match = availableByText.get(key)?.shift();
    return match ? { ...match, text: token } : { id: generateId(), text: token };
  });
}

export function loadScripts(): ScriptDefinition[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SCRIPT_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveScripts(scripts: ScriptDefinition[]) {
  window.localStorage.setItem(SCRIPT_STORAGE_KEY, JSON.stringify(scripts));
}

function cloneElement(element: SceneElement): SceneElement {
  return {
    ...element,
    id: generateId(),
    hideStep: null,
    keyframes: undefined,
  } as SceneElement;
}

function createTextElement(word: string, variant: 'free' | 'block'): TextElement {
  if (variant === 'free') {
    return {
      id: generateId(), type: 'text', variant: 'free', text: word,
      x: 0, y: 0, width: Math.max(220, word.length * 48), height: 120,
      revealStep: 1, fontSize: 64, fontWeight: 'bold', color: '#0f172a',
    };
  }

  const fit = getTextBlockFitSize({
    text: word,
    fontSize: DEFAULT_TEXT_BLOCK_FONT_SIZE,
    subtitleFontSize: DEFAULT_TEXT_BLOCK_SUBTITLE_FONT_SIZE,
    padding: DEFAULT_TEXT_BLOCK_PADDING,
    fontWeight: 'bold',
  });
  return {
    id: generateId(), type: 'text', variant: 'block', text: word,
    x: 0, y: 0, width: fit.width, height: fit.height, revealStep: 1,
    fontSize: DEFAULT_TEXT_BLOCK_FONT_SIZE,
    subtitleFontSize: DEFAULT_TEXT_BLOCK_SUBTITLE_FONT_SIZE,
    padding: DEFAULT_TEXT_BLOCK_PADDING,
    backgroundColor: DEFAULT_TEXT_BLOCK_BACKGROUND_COLOR,
    fontWeight: 'bold', color: '#ffffff',
  };
}

function createElement(
  word: string,
  association: Exclude<ScriptWordAssociation, { kind: 'ignored' }>,
  assetsById: Map<string, Asset>,
): { element: SceneElement; asset?: Asset } | null {
  if (association.kind === 'text') {
    return { element: createTextElement(word, association.variant) };
  }
  if (association.kind === 'icon') {
    return {
      element: {
        id: generateId(), type: 'shape', shapeType: 'icon',
        iconName: association.iconName, iconColor: DEFAULT_ICON_COLOR, iconStrokeWidth: 2.25,
        x: 0, y: 0, width: 180, height: 180, revealStep: 1,
      },
    };
  }
  if (association.kind === 'asset') {
    const asset = assetsById.get(association.assetId);
    if (!asset) return null;
    return {
      element: {
        id: generateId(), type: 'image', assetId: asset.id, frameStyle: 'plain',
        x: 0, y: 0, width: 300, height: 240, revealStep: 1,
      },
      asset,
    };
  }
  return {
    element: cloneElement(association.component.element),
    asset: association.component.asset,
  };
}

function layoutElements(elements: SceneElement[], layout: ScriptLayout): SceneElement[] {
  const marginX = 150;
  const marginY = 120;
  const gap = 48;
  const canvasWidth = 1920;
  const canvasHeight = 1080;
  const count = elements.length;
  const columns = layout === 'vertical' ? 1 : layout === 'horizontal' ? count : Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / Math.max(columns, 1));
  const cellWidth = (canvasWidth - marginX * 2 - gap * Math.max(0, columns - 1)) / Math.max(columns, 1);
  const cellHeight = (canvasHeight - marginY * 2 - gap * Math.max(0, rows - 1)) / Math.max(rows, 1);

  return elements.map((element, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const scale = Math.min(1, cellWidth / element.width, cellHeight / element.height);
    const width = Math.max(1, Math.round(element.width * scale));
    const height = Math.max(1, Math.round(element.height * scale));
    return {
      ...element,
      width,
      height,
      x: Math.round(marginX + column * (cellWidth + gap) + (cellWidth - width) / 2),
      y: Math.round(marginY + row * (cellHeight + gap) + (cellHeight - height) / 2),
      revealStep: index + 1,
      zIndex: index,
    } as SceneElement;
  });
}

export function buildSceneFromScript(
  script: ScriptDefinition,
  availableAssets: Asset[],
): { scene: Scene; assetsToAdd: Asset[] } {
  const assetsById = new Map(availableAssets.map((asset) => [asset.id, asset]));
  const usedAssets = new Map<string, Asset>();
  const built = script.words.flatMap((word) => {
    if (!word.association || word.association.kind === 'ignored') return [];
    const result = createElement(word.text, word.association, assetsById);
    if (!result) return [];
    if (result.asset) usedAssets.set(result.asset.id, result.asset);
    return [result.element];
  });
  const elements = layoutElements(built, script.layout);
  const sequenceCount = Math.max(1, elements.length);
  return {
    scene: {
      id: generateId(),
      name: script.name || script.text.slice(0, 36) || 'Script Scene',
      elements,
      sequenceCount,
      sequences: Array.from({ length: sequenceCount }, (_, index) => ({
        step: index + 1,
        animationType: DEFAULT_SEQUENCE_ANIMATION_TYPE,
        duration: DEFAULT_SEQUENCE_DURATION,
        delay: DEFAULT_SEQUENCE_DELAY,
      })),
    },
    assetsToAdd: Array.from(usedAssets.values()),
  };
}
