import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Check,
  Image as ImageIcon,
  Layers,
  Loader2,
  PanelLeft,
  PanelRight,
  Plus,
  Search,
  Target,
  Type,
  X,
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { Asset, FavoriteComponent, SavedComponent, SceneElement } from '../types';
import { getDefaultImageFrameStyle } from '../assetUtils';
import { generateId, getSceneSequenceCount, getTextPadding, getTextVariant, mergeAssetLibraries, splitTextContent } from '../utils';
import { DEFAULT_ICON_COLOR, formatIconName, searchLucideIcons } from '../iconLibrary';
import { LucideIconGlyph } from './LucideIconGlyph';
import {
  convertRemoteImageToDataUrl,
  getPexelsAssetUrl,
  getPexelsPhotoLabel,
  getPexelsThumbnailUrl,
  PEXELS_IS_CONFIGURED,
  PexelsPhoto,
  searchPexelsPhotos,
} from '../pexels';

type ScriptToken = {
  id: string;
  raw: string;
  value: string;
};

type MatchedComponent = {
  component: SavedComponent;
  source: 'saved' | 'shared';
};

type DedupeElement = Omit<
  SceneElement,
  'assetId' | 'hideStep' | 'id' | 'keyframes' | 'revealStep' | 'x' | 'y' | 'zIndex'
>;

type PlacementSide = 'left' | 'right';
type PlacementFlow = 'vertical' | 'horizontal';
type MissingCreationMode = 'icon' | 'image' | null;

const CANVAS_WIDTH = 1920;
const DEFAULT_SIDE_MARGIN = 150;
const DEFAULT_TOP_MARGIN = 150;
const DEFAULT_PLACEMENT_GAP = 50;
const ICON_RESULT_PAGE_SIZE = 18;
const PEXELS_RESULT_PAGE_SIZE = 6;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toLayoutNumber(value: string) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function matchesSearchQuery(query: string, ...values: Array<string | null | undefined>) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return true;

  const normalizedQuery = trimmedQuery.toLowerCase();
  const compactQuery = normalizeSearchText(trimmedQuery);

  return values.some((value) => {
    if (!value) return false;

    const normalizedValue = value.toLowerCase();
    if (normalizedValue.includes(normalizedQuery)) {
      return true;
    }

    return Boolean(compactQuery) && normalizeSearchText(value).includes(compactQuery);
  });
}

function splitSearchTerms(value: string) {
  return value
    .split(/\s+/)
    .map((term) => cleanScriptToken(term))
    .filter(Boolean);
}

function matchesAnySearchTerm(
  terms: string[],
  ...values: Array<string | null | undefined>
) {
  if (terms.length === 0) return true;

  return terms.some((term) => matchesSearchQuery(term, ...values));
}

function cleanScriptToken(value: string) {
  return value
    .trim()
    .replace(/^[,.;:!?'"()[\]{}]+|[,.;:!?'"()[\]{}]+$/g, '');
}

function tokenizeScriptLine(scriptLine: string): ScriptToken[] {
  return scriptLine
    .split(/\s+/)
    .map((raw, index) => ({
      id: `${index}-${raw}`,
      raw,
      value: cleanScriptToken(raw),
    }))
    .filter((token) => token.value.length > 0);
}

function cloneFavoriteElement(element: SceneElement): SceneElement {
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

function applySavedTextBlockDefaults(element: SceneElement): SceneElement {
  if (element.type !== 'text' || getTextVariant(element) !== 'block') {
    return element;
  }

  return {
    ...element,
    fontSize: 35,
    subtitleFontSize: 30,
    padding: getTextPadding(element),
  };
}

function getComponentTypeLabel(component: SavedComponent) {
  const { element } = component;

  if (element.type === 'text') {
    return getTextVariant(element) === 'free' ? 'Text' : 'Text Block';
  }

  if (element.type === 'image') return 'Image';
  if (element.type === 'color') return 'Color';
  if (element.shapeType === 'emoji') return 'Emoji';
  if (element.shapeType === 'icon') return 'Icon';
  if (element.shapeType === 'yes') return 'Yes';
  if (element.shapeType === 'no') return 'No';
  if (element.shapeType === 'check') return 'Check';
  return 'Cross';
}

function getComponentSearchText(component: SavedComponent) {
  const searchParts = [component.name, getComponentTypeLabel(component)];
  const { element } = component;

  if (element.type === 'text') {
    searchParts.push(element.text);
  }

  if (element.type === 'image') {
    searchParts.push(component.asset?.name);
  }

  if (element.type === 'color') {
    searchParts.push(element.captionText, element.fillColor);
  }

  if (element.type === 'shape') {
    searchParts.push(
      element.iconName,
      element.emojiChar,
      element.emojiHexcode,
      element.shapeType,
    );
  }

  return searchParts.filter(Boolean).join(' ');
}

function getComponentSummary(component: SavedComponent) {
  const { element } = component;

  if (element.type === 'text') {
    const textVariant = getTextVariant(element);
    if (textVariant === 'free') {
      return element.text.split('\n').find((line) => line.trim()) || 'Free text';
    }

    const { title, subtitle } = splitTextContent(element.text);
    return [title, subtitle].filter(Boolean).join(' / ') || 'Text block';
  }

  if (element.type === 'image') {
    return component.asset?.name || 'Image component';
  }

  if (element.type === 'color') {
    return element.captionText || element.fillColor;
  }

  if (element.shapeType === 'icon') {
    return element.iconName || 'Icon';
  }

  if (element.shapeType === 'emoji') {
    return element.emojiChar || element.emojiHexcode || 'Emoji';
  }

  return element.shapeType;
}

function getPreviewIcon(component: SavedComponent) {
  if (component.element.type === 'image') return ImageIcon;
  if (component.element.type === 'text') return Type;
  return Target;
}

function getElementPlacementSide(element: SceneElement): PlacementSide {
  const centerX = element.x + Math.max(1, Math.round(element.width)) / 2;
  return centerX < CANVAS_WIDTH / 2 ? 'left' : 'right';
}

function getSameSideElements(elements: SceneElement[], side: PlacementSide) {
  return elements.filter((element) => getElementPlacementSide(element) === side);
}

function getPlacementOffset(
  elements: SceneElement[],
  side: PlacementSide,
  flow: PlacementFlow,
  gap: number,
) {
  return getSameSideElements(elements, side).reduce((offset, element) => {
    const size = flow === 'vertical' ? element.height : element.width;
    return offset + Math.max(1, Math.round(size)) + gap;
  }, 0);
}

function getVerticalAxisX(
  sameSideElements: SceneElement[],
  elementWidth: number,
  side: PlacementSide,
  sideMargin: number,
  axisWidth = elementWidth,
) {
  const columnWidth = Math.max(
    axisWidth,
    elementWidth,
    ...sameSideElements.map((sameSideElement) => Math.max(1, Math.round(sameSideElement.width))),
  );

  return side === 'left'
    ? sideMargin + columnWidth / 2
    : CANVAS_WIDTH - sideMargin - columnWidth / 2;
}

function getHorizontalAxisY(
  sameSideElements: SceneElement[],
  elementHeight: number,
  topMargin: number,
  axisHeight = elementHeight,
) {
  const rowHeight = Math.max(
    axisHeight,
    elementHeight,
    ...sameSideElements.map((sameSideElement) => Math.max(1, Math.round(sameSideElement.height))),
  );

  return topMargin + rowHeight / 2;
}

function getPlacementPosition(
  element: SceneElement,
  precedingElements: SceneElement[],
  side: PlacementSide,
  flow: PlacementFlow,
  sideMargin: number,
  topMargin: number,
  gap: number,
  axisSize?: number,
) {
  const width = Math.max(1, Math.round(element.width));
  const height = Math.max(1, Math.round(element.height));
  const sameSideElements = getSameSideElements(precedingElements, side);
  const offset = getPlacementOffset(precedingElements, side, flow, gap);
  const maxX = Math.max(sideMargin, CANVAS_WIDTH - width - sideMargin);

  if (flow === 'vertical') {
    const axisX = getVerticalAxisX(sameSideElements, width, side, sideMargin, axisSize);

    return {
      x: clamp(Math.round(axisX - width / 2), sideMargin, maxX),
      y: topMargin + offset,
    };
  }

  const x = side === 'left'
    ? sideMargin + offset
    : CANVAS_WIDTH - width - sideMargin - offset;
  const axisY = getHorizontalAxisY(sameSideElements, height, topMargin, axisSize);

  return {
    x: clamp(x, sideMargin, maxX),
    y: Math.max(0, Math.round(axisY - height / 2)),
  };
}

function getMatchLayoutAxisSize(match: MatchedComponent, flow: PlacementFlow) {
  const element = applySavedTextBlockDefaults(cloneFavoriteElement(match.component.element));
  const size = flow === 'vertical' ? element.width : element.height;
  return Math.max(1, Math.round(size));
}

function getComponentDedupeKey(component: SavedComponent) {
  const {
    id: _id,
    x: _x,
    y: _y,
    zIndex: _zIndex,
    revealStep: _revealStep,
    hideStep: _hideStep,
    keyframes: _keyframes,
    ...element
  } = component.element;

  if (component.element.type === 'image') {
    const { assetId: _assetId, ...imageElement } = element as DedupeElement & { assetId?: string };
    return JSON.stringify({
      name: normalizeSearchText(component.name),
      element: imageElement,
      asset: component.asset
        ? {
            name: normalizeSearchText(component.asset.name),
            dataUrl: component.asset.dataUrl,
          }
        : null,
    });
  }

  return JSON.stringify({
    name: normalizeSearchText(component.name),
    element,
  });
}

function dedupeMatchedComponents(
  favorites: FavoriteComponent[],
  sharedSavedComponents: SavedComponent[],
): MatchedComponent[] {
  const componentMap = new Map<string, MatchedComponent>();
  const contentKeys = new Set<string>();

  favorites.forEach((favorite) => {
    if (favorite.type !== 'saved-element') return;
    const contentKey = getComponentDedupeKey(favorite);
    componentMap.set(favorite.id, {
      component: favorite,
      source: 'saved',
    });
    contentKeys.add(contentKey);
  });

  sharedSavedComponents.forEach((component) => {
    const contentKey = getComponentDedupeKey(component);
    if (componentMap.has(component.id) || contentKeys.has(contentKey)) {
      return;
    }

    componentMap.set(component.id, {
      component,
      source: 'shared',
    });
    contentKeys.add(contentKey);
  });

  return Array.from(componentMap.values());
}

function buildMissingTextBlockComponent(term: string): SavedComponent {
  const id = generateId();

  return {
    type: 'saved-element',
    id,
    name: term,
    element: {
      id: `${id}-element`,
      type: 'text',
      variant: 'block',
      text: term,
      x: 100,
      y: 100,
      width: 400,
      height: 120,
      revealStep: 1,
      fontSize: 35,
      subtitleFontSize: 30,
      padding: 20,
      fontWeight: 'bold',
      color: '#ffffff',
    },
  };
}

function buildMissingFreeTextComponent(term: string): SavedComponent {
  const id = generateId();

  return {
    type: 'saved-element',
    id,
    name: term,
    element: {
      id: `${id}-element`,
      type: 'text',
      variant: 'free',
      text: term,
      x: 100,
      y: 100,
      width: 420,
      height: 80,
      revealStep: 1,
      fontSize: 100,
      fontWeight: 'bold',
      color: '#ffffff',
    },
  };
}

function buildMissingIconComponent(term: string, iconName: string): SavedComponent {
  const id = generateId();

  return {
    type: 'saved-element',
    id,
    name: term,
    element: {
      id: `${id}-element`,
      type: 'shape',
      shapeType: 'icon',
      iconName,
      iconColor: DEFAULT_ICON_COLOR,
      iconStrokeWidth: 2.25,
      x: 100,
      y: 100,
      width: 150,
      height: 150,
      revealStep: 1,
    },
  };
}

function buildMissingImageComponent(term: string, asset: Asset): SavedComponent {
  const id = generateId();

  return {
    type: 'saved-element',
    id,
    name: term,
    asset,
    element: {
      id: `${id}-element`,
      type: 'image',
      assetId: asset.id,
      captionText: '',
      frameStyle: getDefaultImageFrameStyle(asset),
      x: 100,
      y: 100,
      width: 300,
      height: 220,
      revealStep: 1,
    },
  };
}

export function ScriptComponentMatcher({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { state, dispatch } = useAppContext();
  const {
    favoriteComponents,
    sharedSavedComponents,
    project,
    activeSceneIndex,
  } = state;
  const activeScene = project.scenes[activeSceneIndex];
  const availableAssets = mergeAssetLibraries(project.assets, state.sharedAssets);
  const assetsById = new Map<string, Asset>(
    availableAssets.map((asset) => [asset.id, asset]),
  );
  const [scriptLine, setScriptLine] = useState('');
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([]);
  const [componentQuery, setComponentQuery] = useState('');
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [placementSide, setPlacementSide] = useState<PlacementSide>('left');
  const [placementFlow, setPlacementFlow] = useState<PlacementFlow>('vertical');
  const [placementSideMargin, setPlacementSideMargin] = useState(DEFAULT_SIDE_MARGIN);
  const [placementTopMargin, setPlacementTopMargin] = useState(DEFAULT_TOP_MARGIN);
  const [placementGap, setPlacementGap] = useState(DEFAULT_PLACEMENT_GAP);
  const [selectedMissingTerm, setSelectedMissingTerm] = useState<string | null>(null);
  const [missingCreationMode, setMissingCreationMode] = useState<MissingCreationMode>(null);
  const [missingIconQuery, setMissingIconQuery] = useState('');
  const [missingIconLimit, setMissingIconLimit] = useState(ICON_RESULT_PAGE_SIZE);
  const [pexelsQuery, setPexelsQuery] = useState('');
  const [pexelsPage, setPexelsPage] = useState(1);
  const [pexelsPhotos, setPexelsPhotos] = useState<PexelsPhoto[]>([]);
  const [pexelsHasNextPage, setPexelsHasNextPage] = useState(false);
  const [pexelsStatus, setPexelsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [pexelsError, setPexelsError] = useState('');
  const [isImportingPexelsId, setIsImportingPexelsId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');

  const tokens = useMemo(() => tokenizeScriptLine(scriptLine), [scriptLine]);
  const allComponents = useMemo(
    () => dedupeMatchedComponents(favoriteComponents, sharedSavedComponents),
    [favoriteComponents, sharedSavedComponents],
  );
  const selectedWords = tokens
    .filter((token) => selectedTokenIds.includes(token.id))
    .map((token) => token.value);
  const activeSearchTerms =
    selectedWords.length > 0 ? selectedWords : splitSearchTerms(componentQuery);
  const targetTerms = Array.from(
    new Set<string>(activeSearchTerms.map((term) => term.trim()).filter(Boolean)),
  );
  const filteredComponents = allComponents
    .filter(({ component }) =>
      matchesAnySearchTerm(activeSearchTerms, getComponentSearchText(component)),
    )
    .slice(0, 40);
  const orderedFilteredComponents = filteredComponents
    .map((match, index) => {
      const searchText = getComponentSearchText(match.component);
      const termIndex = targetTerms.findIndex((term) => matchesSearchQuery(term, searchText));

      return {
        match,
        index,
        termIndex: termIndex === -1 ? Number.MAX_SAFE_INTEGER : termIndex,
      };
    })
    .sort((first, second) => first.termIndex - second.termIndex || first.index - second.index)
    .map(({ match }) => match);
  const missingTerms = targetTerms.filter(
    (term) =>
      !allComponents.some(({ component }) =>
        matchesSearchQuery(term, getComponentSearchText(component)),
      ),
  );
  const activeMissingTerm =
    selectedMissingTerm && missingTerms.includes(selectedMissingTerm)
      ? selectedMissingTerm
      : missingTerms[0] || '';
  const deferredPexelsQuery = useDeferredValue(pexelsQuery);
  const iconSearchQuery = missingIconQuery || activeMissingTerm;
  const iconSearchResults = useMemo(
    () => searchLucideIcons(iconSearchQuery, missingIconLimit + 1),
    [iconSearchQuery, missingIconLimit],
  );
  const iconResults = iconSearchResults.slice(0, missingIconLimit);
  const hasMoreIconResults = iconSearchResults.length > missingIconLimit;
  const selectedMatchedComponent =
    allComponents.find(({ component }) => component.id === selectedComponentId) ||
    orderedFilteredComponents[0] ||
    null;

  useEffect(() => {
    if (!open || missingCreationMode !== 'image') {
      return;
    }

    if (!PEXELS_IS_CONFIGURED) {
      setPexelsStatus('error');
      setPexelsError('Add VITE_PEXELS_API_KEY to enable Pexels search.');
      setPexelsPhotos([]);
      setPexelsHasNextPage(false);
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setPexelsStatus('error');
      setPexelsError('Pexels search is unavailable while offline.');
      setPexelsPhotos([]);
      setPexelsHasNextPage(false);
      return;
    }

    const query = (deferredPexelsQuery || activeMissingTerm).trim();
    if (!query) {
      setPexelsStatus('idle');
      setPexelsPhotos([]);
      setPexelsError('');
      setPexelsHasNextPage(false);
      return;
    }

    const controller = new AbortController();
    setPexelsStatus('loading');
    setPexelsError('');

    searchPexelsPhotos({
      query,
      perPage: PEXELS_RESULT_PAGE_SIZE,
      page: pexelsPage,
      signal: controller.signal,
    })
      .then((result) => {
        setPexelsStatus('success');
        setPexelsHasNextPage(result.hasNextPage);
        setPexelsPhotos((currentPhotos) => {
          if (pexelsPage === 1) return result.photos;

          const existingIds = new Set(currentPhotos.map((photo) => photo.id));
          return [
            ...currentPhotos,
            ...result.photos.filter((photo) => !existingIds.has(photo.id)),
          ];
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setPexelsStatus('error');
        setPexelsPhotos([]);
        setPexelsHasNextPage(false);
        setPexelsError(
          error instanceof Error ? error.message : 'Pexels search is unavailable right now.',
        );
      });

    return () => controller.abort();
  }, [activeMissingTerm, deferredPexelsQuery, missingCreationMode, open, pexelsPage]);

  if (!open) {
    return null;
  }

  const updateSelectedTokens = (token: ScriptToken) => {
    const nextSelectedTokenIds = selectedTokenIds.includes(token.id)
      ? selectedTokenIds.filter((tokenId) => tokenId !== token.id)
      : [...selectedTokenIds, token.id];
    const nextQuery = tokens
      .filter((entry) => nextSelectedTokenIds.includes(entry.id))
      .map((entry) => entry.value)
      .join(' ');

    setSelectedTokenIds(nextSelectedTokenIds);
    setComponentQuery(nextQuery);
    setSelectedComponentId(null);
    setMissingCreationMode(null);
    setNotice('');
  };

  const saveMissingComponent = (component: SavedComponent, message: string) => {
    dispatch({
      type: 'UPSERT_FAVORITE_COMPONENT',
      payload: component,
    });
    setSelectedComponentId(component.id);
    setSelectedMissingTerm(null);
    setMissingCreationMode(null);
    setNotice(message);
  };

  const createMissingTextBlockComponent = (term: string) => {
    const component = buildMissingTextBlockComponent(term);
    saveMissingComponent(component, `Created text block component for "${term}".`);
  };

  const createMissingFreeTextComponent = (term: string) => {
    const component = buildMissingFreeTextComponent(term);
    saveMissingComponent(component, `Created text component for "${term}".`);
  };

  const openMissingCreator = (term: string, mode: Exclude<MissingCreationMode, null>) => {
    setSelectedMissingTerm(term);
    setMissingCreationMode(mode);
    setMissingIconQuery(term);
    setMissingIconLimit(ICON_RESULT_PAGE_SIZE);
    setPexelsQuery(term);
    setPexelsPage(1);
    setPexelsPhotos([]);
    setPexelsHasNextPage(false);
    setPexelsError('');
  };

  const createMissingIconComponent = (term: string, iconName: string) => {
    const component = buildMissingIconComponent(term, iconName);
    saveMissingComponent(component, `Created icon component for "${term}".`);
  };

  const createMissingImageComponent = async (term: string, photo: PexelsPhoto) => {
    setIsImportingPexelsId(photo.id);

    try {
      const asset: Asset = {
        id: generateId(),
        name: getPexelsPhotoLabel(photo),
        dataUrl: await convertRemoteImageToDataUrl(getPexelsAssetUrl(photo)),
        kind: 'photo',
      };
      const component = buildMissingImageComponent(term, asset);

      dispatch({
        type: 'ADD_ASSET',
        payload: asset,
      });
      saveMissingComponent(component, `Created image component for "${term}".`);
    } catch (error) {
      setPexelsError(
        error instanceof Error ? error.message : 'Failed to import image from Pexels.',
      );
      setPexelsStatus('error');
    } finally {
      setIsImportingPexelsId(null);
    }
  };

  const createSceneElementFromMatch = (
    match: MatchedComponent,
    revealStep: number,
    precedingElements: SceneElement[],
    axisSize?: number,
  ): SceneElement | null => {
    const nextElement = applySavedTextBlockDefaults(
      cloneFavoriteElement(match.component.element),
    );
    const nextPosition = getPlacementPosition(
      nextElement,
      precedingElements,
      placementSide,
      placementFlow,
      placementSideMargin,
      placementTopMargin,
      placementGap,
      axisSize,
    );
    if (nextElement.type === 'image') {
      let assetId = nextElement.assetId;
      const existingAsset = assetsById.get(assetId);

      if (!existingAsset) {
        if (!match.component.asset) {
          window.alert(
            "This saved component is missing its image asset, so it can't be added right now.",
          );
          return;
        }

        assetId = generateId();
        dispatch({
          type: 'ADD_ASSET',
          payload: {
            ...match.component.asset,
            id: assetId,
          },
        });
      }

      return {
        ...nextElement,
        id: generateId(),
        assetId,
        x: nextPosition.x,
        y: nextPosition.y,
        revealStep,
        hideStep: null,
        keyframes: undefined,
        frameStyle: getDefaultImageFrameStyle(assetsById.get(assetId) || match.component.asset),
      };
    }

    return {
      ...nextElement,
      id: generateId(),
      x: nextPosition.x,
      y: nextPosition.y,
      revealStep,
      hideStep: null,
      keyframes: undefined,
    };
  };

  const getTargetLabel = () =>
    selectedWords.length > 0 ? selectedWords.join(' ') : componentQuery;

  const addMatchedComponentToCurrentScene = (match: MatchedComponent | null) => {
    if (!match || !activeScene) {
      return;
    }

    const revealStep = getSceneSequenceCount(activeScene) + 1;
    const element = createSceneElementFromMatch(match, revealStep, activeScene.elements);
    if (!element) {
      return;
    }

    dispatch({
      type: 'ADD_ELEMENT',
      payload: element,
    });

    const targetLabel = getTargetLabel();
    setNotice(
      targetLabel
        ? `Added "${match.component.name}" for "${targetLabel}" to sequence ${revealStep}.`
        : `Added "${match.component.name}" to sequence ${revealStep}.`,
    );
  };

  const addAllMatchedComponentsToCurrentScene = () => {
    if (!activeScene || orderedFilteredComponents.length === 0) {
      return;
    }

    const firstRevealStep = getSceneSequenceCount(activeScene) + 1;
    const stagedElements = [...activeScene.elements];
    const elements: SceneElement[] = [];
    const axisSize = Math.max(
      1,
      ...orderedFilteredComponents.map((match) => getMatchLayoutAxisSize(match, placementFlow)),
    );

    orderedFilteredComponents.forEach((match) => {
      const element = createSceneElementFromMatch(
        match,
        firstRevealStep + elements.length,
        stagedElements,
        axisSize,
      );

      if (element) {
        elements.push(element);
        stagedElements.push(element);
      }
    });

    if (elements.length === 0) {
      return;
    }

    elements.forEach((element) => {
      dispatch({
        type: 'ADD_ELEMENT',
        payload: element,
      });
    });

    const lastRevealStep = firstRevealStep + elements.length - 1;
    setNotice(
      `Added ${elements.length} component${elements.length === 1 ? '' : 's'} to sequences ${firstRevealStep}-${lastRevealStep}.`,
    );
  };

  const createNewScene = () => {
    const targetLabel = getTargetLabel();
    const sceneName = targetLabel
      ? `Script: ${targetLabel.slice(0, 36)}`
      : `Script Matches ${project.scenes.length + 1}`;

    dispatch({
      type: 'ADD_SCENE',
      payload: {
        id: generateId(),
        name: sceneName,
        elements: [],
        sequenceCount: 1,
      },
    });

    setNotice(`Created "${sceneName}". Use Add or Add All to place components.`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-md bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-[#e2e8f0] px-5 py-4">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#4f46e5]">
              Script Match
            </div>
            <h2 className="mt-1 truncate text-lg font-bold text-[#0f172a]">
              Match Script Words To Components
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-[#e2e8f0] bg-[#f8fafc] text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
            title="Close"
            aria-label="Close script matcher"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(360px,440px)] overflow-hidden max-md:grid-cols-1">
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto border-r border-[#e2e8f0] bg-[#f8fafc] p-5 max-md:border-r-0 max-md:border-b">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Script & Targets
                </div>
                <div className="mt-1 text-[11px] font-semibold text-slate-500">
                  Select words from the line, then match a component.
                </div>
              </div>
              <div className="rounded-full bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#4f46e5]">
                {tokens.length} Words
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Script Line
              </label>
              <textarea
                value={scriptLine}
	                onChange={(event) => {
	                  setScriptLine(event.target.value);
	                  setSelectedTokenIds([]);
	                  setComponentQuery('');
	                  setSelectedComponentId(null);
	                  setSelectedMissingTerm(null);
	                  setMissingCreationMode(null);
	                  setNotice('');
	                }}
                placeholder="Rayan ʿumru-hu 14 sanat-an."
                className="h-28 w-full resize-none rounded-sm border border-[#e2e8f0] bg-white p-3 text-sm leading-relaxed text-[#0f172a] outline-none transition-colors focus:border-[#4f46e5]"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Target Words
                </div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#4f46e5]">
                  {selectedWords.length}
                </div>
              </div>
              <div className="flex min-h-16 flex-wrap gap-2 rounded-sm border border-[#e2e8f0] bg-white p-3">
                {tokens.length > 0 ? (
                  tokens.map((token) => {
                    const isSelected = selectedTokenIds.includes(token.id);

                    return (
                      <button
                        key={token.id}
                        type="button"
                        onClick={() => updateSelectedTokens(token)}
                        className={`rounded-sm border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                          isSelected
                            ? 'border-[#4f46e5] bg-[#eef2ff] text-[#4338ca]'
                            : 'border-[#dbe4f0] bg-[#f8fafc] text-slate-600 hover:border-[#a5b4fc] hover:text-[#4338ca]'
                        }`}
                      >
                        {token.value}
                      </button>
                    );
                  })
                ) : (
                  <div className="flex items-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300">
                    Add a script line to select target words
                  </div>
                )}
              </div>
            </div>

            <label className="flex items-center gap-2 rounded-sm border border-[#e2e8f0] bg-white px-3 py-2 focus-within:border-[#4f46e5]">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={componentQuery}
	                onChange={(event) => {
	                  setComponentQuery(event.target.value);
	                  setSelectedComponentId(null);
	                  setSelectedMissingTerm(null);
	                  setMissingCreationMode(null);
	                }}
                placeholder="Search saved/shared components..."
                className="w-full bg-transparent text-xs text-[#0f172a] outline-none placeholder:text-slate-400"
              />
            </label>

            {notice && (
              <div className="rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
                {notice}
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-col bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-[#e2e8f0] px-5 py-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Component Matches
                </div>
                <div className="mt-1 text-[11px] font-semibold text-slate-500">
                  {filteredComponents.length}/{allComponents.length} available
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => addMatchedComponentToCurrentScene(selectedMatchedComponent)}
                  disabled={!selectedMatchedComponent}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-sm bg-[#4f46e5] px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-[#4338ca] disabled:cursor-not-allowed disabled:opacity-50"
                  title="Add selected component to the current scene after the last sequence"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
                <button
                  type="button"
                  onClick={addAllMatchedComponentsToCurrentScene}
	                  disabled={orderedFilteredComponents.length === 0}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-sm bg-slate-900 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Add all matched components to the current scene as new sequences"
                >
                  Add All
                </button>
                <button
                  type="button"
                  onClick={createNewScene}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-sm border border-[#c7d2fe] bg-[#eef2ff] px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#4338ca] transition-colors hover:bg-[#e0e7ff] disabled:cursor-not-allowed disabled:opacity-50"
                  title="Create an empty scene for these script matches"
                >
                  Create New Scene
                </button>
              </div>
            </div>

            <div className="border-b border-[#e2e8f0] bg-[#f8fafc] px-5 py-2">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Layout
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-sm border border-[#dbe4f0] bg-white p-0.5">
                    <button
                      type="button"
                      aria-label="Place components from the left"
                      aria-pressed={placementSide === 'left'}
                      title="Place from left"
                      onClick={() => setPlacementSide('left')}
                      className={`flex h-8 w-8 items-center justify-center rounded-[2px] transition-colors ${
                        placementSide === 'left'
                          ? 'bg-[#eef2ff] text-[#4f46e5]'
                          : 'text-slate-500 hover:bg-[#f1f5f9] hover:text-[#4f46e5]'
                      }`}
                    >
                      <PanelLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Place components from the right"
                      aria-pressed={placementSide === 'right'}
                      title="Place from right"
                      onClick={() => setPlacementSide('right')}
                      className={`flex h-8 w-8 items-center justify-center rounded-[2px] transition-colors ${
                        placementSide === 'right'
                          ? 'bg-[#eef2ff] text-[#4f46e5]'
                          : 'text-slate-500 hover:bg-[#f1f5f9] hover:text-[#4f46e5]'
                      }`}
                    >
                      <PanelRight className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex rounded-sm border border-[#dbe4f0] bg-white p-0.5">
                    <button
                      type="button"
                      aria-label="Stack components vertically"
                      aria-pressed={placementFlow === 'vertical'}
                      title="Vertical layout"
                      onClick={() => setPlacementFlow('vertical')}
                      className={`flex h-8 w-8 items-center justify-center rounded-[2px] transition-colors ${
                        placementFlow === 'vertical'
                          ? 'bg-[#eef2ff] text-[#4f46e5]'
                          : 'text-slate-500 hover:bg-[#f1f5f9] hover:text-[#4f46e5]'
                      }`}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Place components horizontally"
                      aria-pressed={placementFlow === 'horizontal'}
                      title="Horizontal layout"
                      onClick={() => setPlacementFlow('horizontal')}
                      className={`flex h-8 w-8 items-center justify-center rounded-[2px] transition-colors ${
                        placementFlow === 'horizontal'
                          ? 'bg-[#eef2ff] text-[#4f46e5]'
                          : 'text-slate-500 hover:bg-[#f1f5f9] hover:text-[#4f46e5]'
                      }`}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="min-w-0">
                  <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    Side
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={placementSideMargin}
                    onChange={(event) => setPlacementSideMargin(toLayoutNumber(event.target.value))}
                    className="h-8 w-full rounded-sm border border-[#dbe4f0] bg-white px-2 text-xs font-semibold text-[#0f172a] outline-none transition-colors focus:border-[#4f46e5]"
                  />
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    Top
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={placementTopMargin}
                    onChange={(event) => setPlacementTopMargin(toLayoutNumber(event.target.value))}
                    className="h-8 w-full rounded-sm border border-[#dbe4f0] bg-white px-2 text-xs font-semibold text-[#0f172a] outline-none transition-colors focus:border-[#4f46e5]"
                  />
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    Gap
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={placementGap}
                    onChange={(event) => setPlacementGap(toLayoutNumber(event.target.value))}
                    className="h-8 w-full rounded-sm border border-[#dbe4f0] bg-white px-2 text-xs font-semibold text-[#0f172a] outline-none transition-colors focus:border-[#4f46e5]"
                  />
                </label>
              </div>
            </div>

            {missingTerms.length > 0 && (
              <div className="border-b border-[#e2e8f0] bg-white px-5 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Missing
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#4f46e5]">
                    {missingTerms.length}
                  </div>
                </div>

                <div className="mb-3 flex flex-wrap gap-1.5">
                  {missingTerms.map((term) => {
                    const isActive = activeMissingTerm === term;

                    return (
                      <button
                        key={term}
                        type="button"
                        onClick={() => {
                          setSelectedMissingTerm(term);
                          setMissingCreationMode(null);
                        }}
                        className={`rounded-sm border px-2 py-1 text-[10px] font-bold transition-colors ${
                          isActive
                            ? 'border-[#4f46e5] bg-[#eef2ff] text-[#4338ca]'
                            : 'border-[#dbe4f0] bg-[#f8fafc] text-slate-500 hover:border-[#a5b4fc] hover:text-[#4f46e5]'
                        }`}
                      >
                        {term}
                      </button>
                    );
                  })}
                </div>

                {activeMissingTerm && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-4 gap-1.5">
                      <button
                        type="button"
                        onClick={() => createMissingTextBlockComponent(activeMissingTerm)}
                        className="h-8 rounded-sm border border-[#dbe4f0] bg-[#f8fafc] text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600 transition-colors hover:border-[#4f46e5] hover:bg-white hover:text-[#4f46e5]"
                      >
                        Block
                      </button>
                      <button
                        type="button"
                        onClick={() => createMissingFreeTextComponent(activeMissingTerm)}
                        className="h-8 rounded-sm border border-[#dbe4f0] bg-[#f8fafc] text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600 transition-colors hover:border-[#4f46e5] hover:bg-white hover:text-[#4f46e5]"
                      >
                        Text
                      </button>
                      <button
                        type="button"
                        onClick={() => openMissingCreator(activeMissingTerm, 'icon')}
                        className={`h-8 rounded-sm border text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
                          missingCreationMode === 'icon'
                            ? 'border-[#4f46e5] bg-[#eef2ff] text-[#4338ca]'
                            : 'border-[#dbe4f0] bg-[#f8fafc] text-slate-600 hover:border-[#4f46e5] hover:bg-white hover:text-[#4f46e5]'
                        }`}
                      >
                        Icon
                      </button>
                      <button
                        type="button"
                        onClick={() => openMissingCreator(activeMissingTerm, 'image')}
                        className={`h-8 rounded-sm border text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
                          missingCreationMode === 'image'
                            ? 'border-[#4f46e5] bg-[#eef2ff] text-[#4338ca]'
                            : 'border-[#dbe4f0] bg-[#f8fafc] text-slate-600 hover:border-[#4f46e5] hover:bg-white hover:text-[#4f46e5]'
                        }`}
                      >
                        Image
                      </button>
                    </div>

                    {missingCreationMode === 'icon' && (
                      <div className="space-y-2 rounded-sm border border-[#e2e8f0] bg-[#f8fafc] p-2">
                        <label className="flex items-center gap-2 rounded-sm border border-[#dbe4f0] bg-white px-2 py-1.5 focus-within:border-[#4f46e5]">
                          <Search className="h-3.5 w-3.5 text-slate-400" />
	                          <input
	                            type="text"
	                            value={missingIconQuery}
	                            onChange={(event) => {
	                              setMissingIconQuery(event.target.value);
	                              setMissingIconLimit(ICON_RESULT_PAGE_SIZE);
	                            }}
	                            placeholder="Search icons..."
	                            className="w-full bg-transparent text-xs text-[#0f172a] outline-none placeholder:text-slate-400"
                          />
                        </label>
                        {iconResults.length > 0 ? (
                          <div className="max-h-40 overflow-y-auto pr-1">
                            <div className="grid grid-cols-6 gap-1.5">
                              {iconResults.map((iconName) => (
                                <button
                                  key={iconName}
                                  type="button"
                                  onClick={() => createMissingIconComponent(activeMissingTerm, iconName)}
                                  className="flex h-9 items-center justify-center rounded-sm border border-slate-700 bg-slate-900 text-white transition-colors hover:border-[#818cf8] hover:bg-slate-800 hover:text-[#c7d2fe]"
                                  title={formatIconName(iconName)}
                                >
                                  <LucideIconGlyph name={iconName} className="h-4 w-4" />
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
	                          <div className="rounded-sm border border-dashed border-[#dbe4f0] px-3 py-4 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
	                            No icons match
	                          </div>
	                        )}
	                        {hasMoreIconResults && (
	                          <button
	                            type="button"
	                            onClick={() => setMissingIconLimit((limit) => limit + ICON_RESULT_PAGE_SIZE)}
	                            className="flex h-8 w-full items-center justify-center rounded-sm border border-[#dbe4f0] bg-white text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600 transition-colors hover:border-[#4f46e5] hover:text-[#4f46e5]"
	                          >
	                            More
	                          </button>
	                        )}
	                      </div>
	                    )}

                    {missingCreationMode === 'image' && (
                      <div className="space-y-2 rounded-sm border border-[#e2e8f0] bg-[#f8fafc] p-2">
                        <label className="flex items-center gap-2 rounded-sm border border-[#dbe4f0] bg-white px-2 py-1.5 focus-within:border-[#4f46e5]">
                          <Search className="h-3.5 w-3.5 text-slate-400" />
	                          <input
	                            type="text"
	                            value={pexelsQuery}
	                            onChange={(event) => {
	                              setPexelsQuery(event.target.value);
	                              setPexelsPage(1);
	                              setPexelsPhotos([]);
	                              setPexelsHasNextPage(false);
	                            }}
	                            placeholder="Search Pexels photos..."
	                            className="w-full bg-transparent text-xs text-[#0f172a] outline-none placeholder:text-slate-400"
                          />
                          {pexelsStatus === 'loading' && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#4f46e5]" />
                          )}
                        </label>

                        {pexelsStatus === 'error' ? (
                          <div className="rounded-sm border border-dashed border-rose-200 bg-rose-50 px-3 py-4 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-rose-600">
                            {pexelsError || 'Pexels unavailable'}
                          </div>
                        ) : pexelsStatus === 'success' && pexelsPhotos.length === 0 ? (
                          <div className="rounded-sm border border-dashed border-[#dbe4f0] px-3 py-4 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                            No Pexels images match
                          </div>
                        ) : (
                          <div className="max-h-52 overflow-y-auto pr-1">
                            <div className="grid grid-cols-3 gap-2">
                              {pexelsPhotos.map((photo) => (
                                <button
                                  key={photo.id}
                                  type="button"
                                  onClick={() => void createMissingImageComponent(activeMissingTerm, photo)}
                                  disabled={isImportingPexelsId === photo.id}
                                  className="group relative aspect-square overflow-hidden rounded-sm border border-[#dbe4f0] bg-slate-100 disabled:cursor-wait disabled:opacity-70"
                                  title={photo.alt || 'Pexels photo'}
                                >
                                  <img
                                    src={getPexelsThumbnailUrl(photo)}
                                    alt={photo.alt || 'Pexels photo'}
                                    loading="lazy"
                                    className="h-full w-full object-cover"
                                  />
                                  <span className="absolute inset-x-1 bottom-1 flex items-center justify-center rounded-sm bg-white/95 px-1 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                                    {isImportingPexelsId === photo.id ? 'Saving' : 'Use'}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
	                        )}
	                        {pexelsHasNextPage && pexelsPhotos.length > 0 && (
	                          <button
	                            type="button"
	                            onClick={() => setPexelsPage((page) => page + 1)}
	                            disabled={pexelsStatus === 'loading'}
	                            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-sm border border-[#dbe4f0] bg-white text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600 transition-colors hover:border-[#4f46e5] hover:text-[#4f46e5] disabled:cursor-wait disabled:opacity-70"
	                          >
	                            {pexelsStatus === 'loading' ? (
	                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
	                            ) : null}
	                            More
	                          </button>
	                        )}
	                      </div>
	                    )}
                  </div>
                )}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {orderedFilteredComponents.length > 0 ? (
                <div className="space-y-2">
                  {orderedFilteredComponents.map((match) => {
                    const { component, source } = match;
                    const isSelected = selectedMatchedComponent?.component.id === component.id;
                    const Icon = getPreviewIcon(component);

                    return (
                      <button
                        key={component.id}
                        type="button"
                        onClick={() => setSelectedComponentId(component.id)}
                        onDoubleClick={() => addMatchedComponentToCurrentScene(match)}
                        className={`w-full rounded-sm border p-3 text-left transition-colors ${
                          isSelected
                            ? 'border-[#4f46e5] bg-[#eef2ff]'
                            : 'border-[#e2e8f0] bg-[#f8fafc] hover:border-[#a5b4fc] hover:bg-white'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border ${
                              isSelected
                                ? 'border-[#c7d2fe] bg-white text-[#4f46e5]'
                                : 'border-[#dbe4f0] bg-white text-slate-500'
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate text-xs font-bold text-[#0f172a]">
                                {component.name}
                              </div>
                              {isSelected && (
                                <Check className="h-3.5 w-3.5 shrink-0 text-[#4f46e5]" />
                              )}
                            </div>
                            <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-500">
                              {getComponentSummary(component)}
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                                {getComponentTypeLabel(component)}
                              </span>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] ${
                                source === 'shared'
                                  ? 'bg-[#eef2ff] text-[#4f46e5]'
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}>
                                {source === 'shared' && <Layers className="h-3 w-3" />}
                                {source}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex min-h-56 items-center justify-center rounded-sm border border-dashed border-[#dbe4f0] px-6 py-10 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  No saved or shared components match this target
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
