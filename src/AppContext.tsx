import React, { createContext, useContext, useEffect, useReducer, ReactNode } from 'react';
import {
  AppMode,
  AppScreen,
  Asset,
  DEFAULT_SEQUENCE_ANIMATION_TYPE,
  DEFAULT_SEQUENCE_DELAY,
  DEFAULT_SEQUENCE_DURATION,
  ElementKeyframe,
  FavoriteComponent,
  Project,
  SavedComponent,
  Scene,
  SceneElement,
  SceneTemplate,
} from './types';
import { loadPersistedLibrary, PersistedLibraryRecord, savePersistedLibrary } from './persistence';
import { getAssetKind, getDefaultImageFrameStyle } from './assetUtils';
import { buildSceneTemplate, generateId, getSceneSequenceCount, mergeAssetLibraries } from './utils';

const PROJECT_LIBRARY_KEY = 'visual-learning-projects';
const TEMPLATE_LIBRARY_KEY = 'visual-learning-templates';
const LEGACY_PROJECT_KEY = 'visual-learning-project';
const FAVORITE_COMPONENTS_STORAGE_KEY = 'visual-learning-favorite-components';
const EXPLICIT_SHARED_ASSETS_VERSION = 2;

interface AppState {
  isHydrated: boolean;
  projects: Project[];
  sharedAssets: Asset[];
  sharedSavedComponents: SavedComponent[];
  favoriteComponents: FavoriteComponent[];
  templates: SceneTemplate[];
  project: Project;
  activeProjectId: string | null;
  currentScreen: AppScreen;
  activeSceneIndex: number;
  selectedElementId: string | null;
  selectedElementIds: string[];
  selectedSequenceStep: number | null;
  mode: AppMode;
  presentationSceneIndex: number;
  presentationRevealStep: number;
}

type Action =
  | { type: 'HYDRATE'; payload: PersistedLibraryRecord | null }
  | { type: 'LOAD_PROJECT'; payload: Project }
  | { type: 'CREATE_PROJECT' }
  | { type: 'OPEN_PROJECT'; payload: string }
  | { type: 'SAVE_PROJECT' }
  | { type: 'DELETE_PROJECT'; payload: string }
  | { type: 'USE_TEMPLATE'; payload: string }
  | { type: 'SET_SCREEN'; payload: AppScreen }
  | { type: 'SET_MODE'; payload: AppMode }
  | { type: 'SET_ACTIVE_SCENE'; payload: number }
  | { type: 'ADD_SCENE'; payload: Scene }
  | { type: 'DUPLICATE_SCENE'; payload: number }
  | { type: 'MOVE_SCENE'; payload: { fromIndex: number; toIndex: number } }
  | { type: 'DELETE_SCENE'; payload: number }
  | { type: 'UPDATE_SCENE'; payload: { index: number; scene: Scene } }
  | { type: 'ADD_ASSET'; payload: Asset }
  | { type: 'DELETE_ASSET'; payload: string }
  | { type: 'ADD_SHARED_ASSET'; payload: Asset }
  | { type: 'DELETE_SHARED_ASSET'; payload: string }
  | { type: 'UPSERT_SHARED_SAVED_COMPONENT'; payload: SavedComponent }
  | { type: 'DELETE_SHARED_SAVED_COMPONENT'; payload: string }
  | { type: 'DELETE_SAVED_COMPONENT'; payload: string }
  | { type: 'UPDATE_PROJECT_NAME'; payload: string }
  | { type: 'ADD_TEMPLATE'; payload: SceneTemplate }
  | { type: 'TOGGLE_FAVORITE_COMPONENT'; payload: FavoriteComponent }
  | { type: 'UPSERT_FAVORITE_COMPONENT'; payload: FavoriteComponent }
  | { type: 'SELECT_ELEMENT'; payload: string | null }
  | { type: 'SELECT_ELEMENTS'; payload: string[] }
  | { type: 'TOGGLE_ELEMENT_SELECTION'; payload: string }
  | { type: 'ADD_ELEMENT'; payload: SceneElement }
  | { type: 'UPDATE_ELEMENT'; payload: { id: string; updates: Partial<SceneElement> } }
  | { type: 'REPLACE_ELEMENT'; payload: { id: string; element: SceneElement } }
  | { type: 'DELETE_ELEMENT'; payload: string }
  | { type: 'DELETE_ELEMENTS'; payload: string[] }
  | { type: 'DUPLICATE_ELEMENT'; payload: string }
  | { type: 'DUPLICATE_ELEMENTS'; payload: string[] }
  | { type: 'SET_PRESENTATION_SCENE'; payload: number }
  | { type: 'SET_PRESENTATION_STEP'; payload: number }
  | { type: 'ADD_SEQUENCE'; payload: { sceneIndex: number; position?: 'start' | 'end' } }
  | { type: 'DELETE_SEQUENCE'; payload: { sceneIndex: number; sequenceStep: number } }
  | { type: 'SELECT_SEQUENCE'; payload: number | null }
  | { type: 'UPDATE_SEQUENCE_CONFIG'; payload: { sceneIndex: number; step: number; config: Partial<import('./types').SequenceConfig> } }
  | { type: 'DELETE_TEMPLATE'; payload: string }
  | { type: 'UPDATE_TEMPLATE'; payload: { id: string; name: string } };

type HistoryAction = Action | { type: 'UNDO' } | { type: 'REDO' };

interface HistoryState {
  past: AppState[];
  present: AppState;
  future: AppState[];
}

const HISTORY_LIMIT = 100;
type SequenceFrameKey = 'x' | 'y' | 'width' | 'height';

const SEQUENCE_FRAME_KEYFIELDS: SequenceFrameKey[] = ['x', 'y', 'width', 'height'];

const TRACKED_ACTIONS = new Set<Action['type']>([
  'USE_TEMPLATE',
  'ADD_SCENE',
  'DUPLICATE_SCENE',
  'MOVE_SCENE',
  'DELETE_SCENE',
  'UPDATE_SCENE',
  'ADD_ASSET',
  'DELETE_ASSET',
  'ADD_SHARED_ASSET',
  'DELETE_SHARED_ASSET',
  'UPSERT_SHARED_SAVED_COMPONENT',
  'DELETE_SHARED_SAVED_COMPONENT',
  'UPDATE_PROJECT_NAME',
  'ADD_TEMPLATE',
  'DELETE_TEMPLATE',
  'UPDATE_TEMPLATE',
  'ADD_ELEMENT',
  'UPDATE_ELEMENT',
  'REPLACE_ELEMENT',
  'DELETE_ELEMENT',
  'DELETE_ELEMENTS',
  'DUPLICATE_ELEMENT',
  'DUPLICATE_ELEMENTS',
  'ADD_SEQUENCE',
  'DELETE_SEQUENCE',
  'UPDATE_SEQUENCE_CONFIG',
]);

function getTimestamp() {
  return new Date().toISOString();
}

function getSelectionState(selectedElementId: string | null) {
  return {
    selectedElementId,
    selectedElementIds: selectedElementId ? [selectedElementId] : [],
  };
}

function getMultiSelectionState(selectedElementIds: string[]) {
  const nextSelectedElementIds = Array.from(new Set(selectedElementIds));

  return {
    selectedElementId: nextSelectedElementIds[0] || null,
    selectedElementIds: nextSelectedElementIds,
  };
}

function cloneElement(element: SceneElement, overrides: Partial<SceneElement> = {}): SceneElement {
  const keyframesSource = Object.prototype.hasOwnProperty.call(overrides, 'keyframes')
    ? overrides.keyframes
    : element.keyframes;
  const zIndex = Object.prototype.hasOwnProperty.call(overrides, 'zIndex')
    ? overrides.zIndex
    : element.zIndex;

  const clonedElement = {
    ...element,
    ...overrides,
    zIndex: zIndex ?? 0,
    keyframes: keyframesSource
      ? Object.fromEntries(
          Object.entries(keyframesSource).map(([step, keyframe]) => [Number(step), { ...keyframe }]),
        )
      : undefined,
  } as SceneElement;

  if (clonedElement.type === 'text' && !clonedElement.variant) {
    clonedElement.variant = 'block';
  }

  return clonedElement;
}

function cloneScene(scene: Scene, overrides: Partial<Scene> = {}): Scene {
  return {
    ...scene,
    ...overrides,
    elements: (overrides.elements || scene.elements).map((element) => cloneElement(element)),
    sequences: (overrides.sequences || scene.sequences)?.map((sequence) => ({ ...sequence })),
  };
}

function normalizeAsset(asset: Partial<Asset> | null | undefined): Asset {
  return {
    id: asset?.id || generateId(),
    name: asset?.name || 'Asset',
    dataUrl: asset?.dataUrl || '',
    kind: getAssetKind({
      kind: asset?.kind,
      name: asset?.name || 'Asset',
      dataUrl: asset?.dataUrl || '',
    }),
  };
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

function normalizeFavoriteComponent(
  favorite: Partial<FavoriteComponent> | null | undefined,
): FavoriteComponent | null {
  if (!favorite || typeof favorite !== 'object' || typeof favorite.type !== 'string') {
    return null;
  }

  if (favorite.type === 'preset' || favorite.type === 'icon' || favorite.type === 'emoji' || favorite.type === 'asset') {
    if (typeof favorite.id !== 'string' || favorite.id.length === 0) {
      return null;
    }

    return {
      type: favorite.type,
      id: favorite.id,
    } as FavoriteComponent;
  }

  if (favorite.type === 'saved-element') {
    if (
      typeof favorite.id !== 'string' ||
      favorite.id.length === 0 ||
      typeof favorite.name !== 'string' ||
      !favorite.element
    ) {
      return null;
    }

    return {
      type: 'saved-element',
      id: favorite.id,
      name: favorite.name,
      element: cloneFavoriteElement(favorite.element as SceneElement),
      asset: favorite.asset ? normalizeAsset(favorite.asset) : undefined,
    };
  }

  return null;
}

function normalizeFavoriteComponents(favorites: unknown): FavoriteComponent[] {
  if (!Array.isArray(favorites)) {
    return [];
  }

  const seenKeys = new Set<string>();
  const normalizedFavorites: FavoriteComponent[] = [];

  for (const favorite of favorites) {
    const normalizedFavorite = normalizeFavoriteComponent(favorite as FavoriteComponent);
    if (!normalizedFavorite) {
      continue;
    }

    const key = `${normalizedFavorite.type}:${normalizedFavorite.id}`;
    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    normalizedFavorites.push(normalizedFavorite);
  }

  return normalizedFavorites;
}

function isSavedComponent(component: FavoriteComponent): component is SavedComponent {
  return component.type === 'saved-element';
}

function normalizeSavedComponents(components: unknown): SavedComponent[] {
  return normalizeFavoriteComponents(components).filter(isSavedComponent);
}

function getAssetFingerprint(asset: Pick<Asset, 'name' | 'dataUrl' | 'kind'>) {
  return `${asset.name}::${asset.kind || ''}::${asset.dataUrl}`;
}

function migrateSharedAssets(
  projects: Project[],
  sharedAssets: Asset[],
  sharedAssetsVersion?: number,
) {
  if (sharedAssetsVersion === EXPLICIT_SHARED_ASSETS_VERSION) {
    return mergeAssetLibraries(sharedAssets);
  }

  const projectAssetCounts = new Map<string, number>();

  for (const project of projects) {
    const seenFingerprints = new Set<string>();
    for (const asset of project.assets) {
      const fingerprint = getAssetFingerprint(asset);
      if (seenFingerprints.has(fingerprint)) {
        continue;
      }

      seenFingerprints.add(fingerprint);
      projectAssetCounts.set(
        fingerprint,
        (projectAssetCounts.get(fingerprint) || 0) + 1,
      );
    }
  }

  return mergeAssetLibraries(
    sharedAssets.filter((asset) => {
      const projectCount = projectAssetCounts.get(getAssetFingerprint(asset)) || 0;
      return projectCount === 0 || projectCount > 1;
    }),
  );
}

function normalizeScene(
  scene: Partial<Scene> | null | undefined,
  index = 0,
  assetsById?: Map<string, Asset>,
): Scene {
  return {
    id: scene?.id || generateId(),
    name: scene?.name || `Scene ${index + 1}`,
    elements: Array.isArray(scene?.elements)
      ? scene.elements.map((element, elementIndex) => {
          const sceneElement = element as SceneElement;

          if (sceneElement.type === 'image') {
            return cloneElement(sceneElement, {
              zIndex: sceneElement.zIndex ?? elementIndex,
              frameStyle: sceneElement.frameStyle || getDefaultImageFrameStyle(assetsById?.get(sceneElement.assetId)),
            });
          }

          return cloneElement(sceneElement, {
            zIndex: sceneElement.zIndex ?? elementIndex,
          });
        })
      : [],
    sequenceCount: scene?.sequenceCount,
    sequences: Array.isArray(scene?.sequences) ? scene.sequences.map((sequence) => ({ ...sequence })) : undefined,
  };
}

function getNextElementZIndex(elements: SceneElement[]) {
  return elements.reduce((maxZIndex, element) => Math.max(maxZIndex, element.zIndex ?? 0), -1) + 1;
}

function shiftKeyframesAfterDeletedStep(
  keyframes: SceneElement['keyframes'],
  deletedStep: number,
): SceneElement['keyframes'] {
  if (!keyframes) {
    return keyframes;
  }

  const nextEntries = Object.entries(keyframes).flatMap(([stepValue, keyframe]) => {
    const step = Number(stepValue);
    if (step === deletedStep) {
      return [];
    }

    return [[step > deletedStep ? step - 1 : step, { ...keyframe }] as const];
  });

  return nextEntries.length > 0 ? Object.fromEntries(nextEntries) : undefined;
}

function applyElementUpdates(
  element: SceneElement,
  updates: Partial<SceneElement>,
  selectedSequenceStep: number | null,
): SceneElement {
  if (selectedSequenceStep === null || selectedSequenceStep <= element.revealStep) {
    return cloneElement(element, updates);
  }

  const includesFrameUpdate = SEQUENCE_FRAME_KEYFIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(updates, field),
  );

  if (!includesFrameUpdate) {
    return cloneElement(element, updates);
  }

  const baseUpdates = { ...updates } as Partial<SceneElement>;
  const keyframesSource = Object.prototype.hasOwnProperty.call(updates, 'keyframes')
    ? updates.keyframes
    : element.keyframes;
  const nextKeyframes = { ...(keyframesSource || {}) };
  const nextKeyframe: ElementKeyframe = {
    ...(nextKeyframes[selectedSequenceStep] || {}),
  };
  const mutableFrameValues = nextKeyframe as Record<SequenceFrameKey, number | undefined>;

  for (const field of SEQUENCE_FRAME_KEYFIELDS) {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) {
      continue;
    }

    const value = updates[field];
    if (typeof value === 'number') {
      mutableFrameValues[field] = value;
    }

    delete (baseUpdates as Partial<Record<keyof SceneElement, unknown>>)[field];
  }

  nextKeyframes[selectedSequenceStep] = nextKeyframe;

  return cloneElement(element, {
    ...baseUpdates,
    keyframes: nextKeyframes,
  });
}

function replaceElementContent(
  currentElement: SceneElement,
  replacementElement: SceneElement,
): SceneElement {
  return cloneElement(replacementElement, {
    id: currentElement.id,
    x: currentElement.x,
    y: currentElement.y,
    width: currentElement.width,
    height: currentElement.height,
    zIndex: currentElement.zIndex,
    revealStep: currentElement.revealStep,
    hideStep: currentElement.hideStep,
    keyframes: currentElement.keyframes,
  });
}

function createDefaultScene(name = 'Scene 1'): Scene {
  return normalizeScene({ name, elements: [] });
}

function createEmptyProject(name = 'Untitled Project'): Project {
  const now = getTimestamp();

  return {
    id: generateId(),
    name,
    scenes: [createDefaultScene()],
    assets: [],
    templates: [],
    createdAt: now,
    updatedAt: now,
  };
}

function parseStoredJson<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function normalizeProject(project: Partial<Project> | null | undefined): Project {
  const fallback = createEmptyProject();
  const assets = Array.isArray(project?.assets) ? project.assets.map((asset) => normalizeAsset(asset)) : [];
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const scenes = Array.isArray(project?.scenes) && project.scenes.length > 0
    ? project.scenes.map((scene, index) => normalizeScene(scene, index, assetsById))
    : [createDefaultScene()];

  return {
    id: project?.id || fallback.id,
    name: project?.name || fallback.name,
    scenes,
    assets,
    templates: [],
    createdAt: project?.createdAt || project?.updatedAt || fallback.createdAt,
    updatedAt: project?.updatedAt || project?.createdAt || fallback.updatedAt,
  };
}

function normalizeTemplate(template: Partial<SceneTemplate> | null | undefined, fallbackAssets: Asset[] = []): SceneTemplate {
  const assets = Array.isArray(template?.assets)
    ? template.assets.map((asset) => normalizeAsset(asset))
    : fallbackAssets.map((asset) => normalizeAsset(asset));
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const normalizedScene = normalizeScene(template?.scene || (template as unknown as Scene), 0, assetsById);
  const name = template?.name || normalizedScene.name || 'Template';

  return buildSceneTemplate(normalizedScene, assets, name, {
    id: template?.id,
    kind: template?.kind || 'scene',
    createdAt: template?.createdAt,
    updatedAt: template?.updatedAt,
  });
}

function createImportedProject(project: Project): Project {
  const imported = normalizeProject(project);
  const now = getTimestamp();

  return {
    ...imported,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
}

function stampProject(project: Project): Project {
  return {
    ...normalizeProject(project),
    updatedAt: getTimestamp(),
  };
}

function upsertProject(projects: Project[], project: Project): Project[] {
  const existingIndex = projects.findIndex((entry) => entry.id === project.id);
  if (existingIndex === -1) {
    return [...projects, project];
  }

  const nextProjects = [...projects];
  nextProjects[existingIndex] = project;
  return nextProjects;
}

function upsertTemplate(templates: SceneTemplate[], template: SceneTemplate): SceneTemplate[] {
  const existingIndex = templates.findIndex((entry) => entry.id === template.id);
  if (existingIndex === -1) {
    return [...templates, template];
  }

  const nextTemplates = [...templates];
  nextTemplates[existingIndex] = template;
  return nextTemplates;
}

function applyProjectUpdate(state: AppState, project: Project, overrides: Partial<AppState> = {}): AppState {
  const savedProject = stampProject(project);
  const activeProjectId = overrides.activeProjectId ?? state.activeProjectId ?? savedProject.id;
  const sharedAssets = overrides.sharedAssets ?? state.sharedAssets;

  return {
    ...state,
    ...overrides,
    project: savedProject,
    activeProjectId,
    sharedAssets,
    projects: upsertProject(state.projects, savedProject),
  };
}

function collectLegacyTemplates(rawProjects: Partial<Project>[]): SceneTemplate[] {
  const templates: SceneTemplate[] = [];

  for (const rawProject of rawProjects) {
    const assets = Array.isArray(rawProject.assets) ? rawProject.assets.map((asset) => normalizeAsset(asset)) : [];
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const rawTemplates = Array.isArray(rawProject.templates) ? rawProject.templates : [];

    for (const rawTemplate of rawTemplates) {
      const normalizedScene = normalizeScene(rawTemplate, 0, assetsById);
      templates.push(
        buildSceneTemplate(normalizedScene, assets, normalizedScene.name || 'Template', {
          createdAt: rawProject.updatedAt || rawProject.createdAt,
          updatedAt: rawProject.updatedAt || rawProject.createdAt,
        }),
      );
    }
  }

  return templates;
}

function buildBranchFromTemplate(project: Project, sceneIndex: number, template: SceneTemplate): Project {
  const assetIdMap = new Map<string, string>();
  const nextAssets = [...project.assets];

  for (const templateAsset of template.assets) {
    const existingAsset = nextAssets.find((asset) => asset.dataUrl === templateAsset.dataUrl && asset.name === templateAsset.name);
    if (existingAsset) {
      assetIdMap.set(templateAsset.id, existingAsset.id);
      continue;
    }

    const nextAssetId = generateId();
    assetIdMap.set(templateAsset.id, nextAssetId);
    nextAssets.push({ ...templateAsset, id: nextAssetId });
  }

  const nextScenes = [...project.scenes];
  const targetScene = nextScenes[sceneIndex];
  if (!targetScene) {
    return project;
  }

  const sequenceOffset = getSceneSequenceCount(targetScene);
  const branchSequenceCount = getSceneSequenceCount(template.scene);
  const currentMaxZIndex = targetScene.elements.reduce((maxZIndex, element) => Math.max(maxZIndex, element.zIndex ?? 0), -1);
  const templateMinZIndex = template.scene.elements.reduce((minZIndex, element) => Math.min(minZIndex, element.zIndex ?? 0), 0);

  const appendedElements = template.scene.elements.map((element) => {
    const shiftedKeyframes = element.keyframes
      ? Object.fromEntries(
          Object.entries(element.keyframes).map(([step, keyframe]) => [Number(step) + sequenceOffset, { ...keyframe }]),
        )
      : undefined;

    if (element.type === 'image') {
      return cloneElement(element, {
        id: generateId(),
        assetId: assetIdMap.get(element.assetId) || element.assetId,
        revealStep: element.revealStep + sequenceOffset,
        hideStep: element.hideStep != null ? element.hideStep + sequenceOffset : element.hideStep,
        keyframes: shiftedKeyframes,
        zIndex: currentMaxZIndex + 1 + ((element.zIndex ?? 0) - templateMinZIndex),
      } as Partial<SceneElement>);
    }

    return cloneElement(element, {
      id: generateId(),
      revealStep: element.revealStep + sequenceOffset,
      hideStep: element.hideStep != null ? element.hideStep + sequenceOffset : element.hideStep,
      keyframes: shiftedKeyframes,
      zIndex: currentMaxZIndex + 1 + ((element.zIndex ?? 0) - templateMinZIndex),
    });
  });

  const appendedSequences = (template.scene.sequences || []).map((sequence) => ({
    ...sequence,
    step: sequence.step + sequenceOffset,
  }));

  nextScenes[sceneIndex] = {
    ...targetScene,
    elements: [...targetScene.elements, ...appendedElements],
    sequenceCount: sequenceOffset + branchSequenceCount,
    sequences: [...(targetScene.sequences || []), ...appendedSequences],
  };

  return {
    ...project,
    assets: nextAssets,
    scenes: nextScenes,
  };
}

function buildSceneFromTemplate(project: Project, template: SceneTemplate): Project {
  const assetIdMap = new Map<string, string>();
  const nextAssets = [...project.assets];

  for (const templateAsset of template.assets) {
    const existingAsset = nextAssets.find((asset) => asset.dataUrl === templateAsset.dataUrl && asset.name === templateAsset.name);
    if (existingAsset) {
      assetIdMap.set(templateAsset.id, existingAsset.id);
      continue;
    }

    const nextAssetId = generateId();
    assetIdMap.set(templateAsset.id, nextAssetId);
    nextAssets.push({ ...templateAsset, id: nextAssetId });
  }

  const nextScene = cloneScene(template.scene, {
    id: generateId(),
    name: `Copy of ${template.name}`,
    elements: template.scene.elements.map((element) => {
      if (element.type === 'image') {
        return cloneElement(element, {
          id: generateId(),
          assetId: assetIdMap.get(element.assetId) || element.assetId,
        } as Partial<SceneElement>);
      }

      return cloneElement(element, { id: generateId() });
    }),
  });

  return {
    ...project,
    assets: nextAssets,
    scenes: [...project.scenes, nextScene],
  };
}

function buildHydratedState(baseState: AppState, payload: PersistedLibraryRecord | null): AppState {
  const rawProjects = Array.isArray(payload?.projects) ? payload.projects : [];
  const projects = rawProjects.map((project) => normalizeProject(project));
  const sharedAssets = migrateSharedAssets(
    projects,
    Array.isArray(payload?.sharedAssets)
      ? payload.sharedAssets.map((asset) => normalizeAsset(asset))
      : [],
    payload?.sharedAssetsVersion,
  );
  const sharedSavedComponents = normalizeSavedComponents(payload?.sharedSavedComponents);
  const favoriteComponents = normalizeFavoriteComponents(payload?.favorites);

  let templates: SceneTemplate[] = [];
  if (Array.isArray(payload?.templates)) {
    templates = payload.templates.map((template) => normalizeTemplate(template));
  }

  if (templates.length === 0 && rawProjects.length > 0) {
    templates = collectLegacyTemplates(rawProjects);
  }

  const requestedProjectId = payload?.activeProjectId || null;
  const activeProjectId = requestedProjectId && projects.some((project) => project.id === requestedProjectId)
    ? requestedProjectId
    : projects[0]?.id || null;
  const activeProject = activeProjectId
    ? projects.find((project) => project.id === activeProjectId) || null
    : null;

  return {
    ...baseState,
    isHydrated: true,
    projects,
    sharedAssets,
    sharedSavedComponents,
    favoriteComponents,
    templates,
    project: activeProject || baseState.project,
    activeProjectId,
  };
}

function loadLegacyLibraryFromLocalStorage(): PersistedLibraryRecord | null {
  const storedProjects = parseStoredJson<Partial<Project>[]>(localStorage.getItem(PROJECT_LIBRARY_KEY));
  const storedTemplates = parseStoredJson<SceneTemplate[]>(localStorage.getItem(TEMPLATE_LIBRARY_KEY));
  const storedFavorites = parseStoredJson<FavoriteComponent[]>(localStorage.getItem(FAVORITE_COMPONENTS_STORAGE_KEY));
  const legacyProject = parseStoredJson<Partial<Project>>(localStorage.getItem(LEGACY_PROJECT_KEY));

  const rawProjects = Array.isArray(storedProjects)
    ? storedProjects
    : legacyProject
      ? [legacyProject]
      : [];

  if (rawProjects.length === 0 && !Array.isArray(storedTemplates) && !Array.isArray(storedFavorites)) {
    return null;
  }

  const projects = rawProjects.map((project) => normalizeProject(project));
  const templates = Array.isArray(storedTemplates)
    ? storedTemplates.map((template) => normalizeTemplate(template))
    : collectLegacyTemplates(rawProjects);

  return {
    activeProjectId: projects[0]?.id || null,
    projects,
    sharedAssetsVersion: EXPLICIT_SHARED_ASSETS_VERSION,
    sharedAssets: [],
    sharedSavedComponents: [],
    favorites: normalizeFavoriteComponents(storedFavorites),
    templates,
  };
}

function clearLegacyLocalStorage() {
  localStorage.removeItem(PROJECT_LIBRARY_KEY);
  localStorage.removeItem(TEMPLATE_LIBRARY_KEY);
  localStorage.removeItem(LEGACY_PROJECT_KEY);
  localStorage.removeItem(FAVORITE_COMPONENTS_STORAGE_KEY);
}

const initialState: AppState = {
  isHydrated: false,
  projects: [],
  sharedAssets: [],
  sharedSavedComponents: [],
  favoriteComponents: [],
  templates: [],
  project: createEmptyProject(),
  activeProjectId: null,
  currentScreen: 'projects',
  activeSceneIndex: 0,
  selectedElementId: null,
  selectedElementIds: [],
  selectedSequenceStep: null,
  mode: 'editor',
  presentationSceneIndex: 0,
  presentationRevealStep: 1,
};

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'HYDRATE':
      return buildHydratedState(initialState, action.payload);
    case 'LOAD_PROJECT': {
      const importedProject = createImportedProject(action.payload);
      const importedTemplates = Array.isArray(action.payload.templates)
        ? action.payload.templates.map((template) =>
            buildSceneTemplate(normalizeScene(template), importedProject.assets, template.name || 'Imported Template', {
              kind: (template as Partial<SceneTemplate>).kind || 'scene',
            }),
          )
        : [];

      return {
        ...state,
        projects: upsertProject(state.projects, importedProject),
        templates: importedTemplates.reduce((library, template) => upsertTemplate(library, template), state.templates),
        project: importedProject,
        activeProjectId: importedProject.id,
        currentScreen: 'editor',
        mode: 'editor',
        activeSceneIndex: 0,
        ...getSelectionState(null),
        selectedSequenceStep: null,
        presentationSceneIndex: 0,
        presentationRevealStep: 1,
      };
    }
    case 'CREATE_PROJECT': {
      const nextProjectNumber = state.projects.length + 1;
      const newProject = createEmptyProject(`Project ${nextProjectNumber}`);

      return {
        ...state,
        projects: upsertProject(state.projects, newProject),
        project: newProject,
        activeProjectId: newProject.id,
        currentScreen: 'editor',
        mode: 'editor',
        activeSceneIndex: 0,
        ...getSelectionState(null),
        selectedSequenceStep: null,
        presentationSceneIndex: 0,
        presentationRevealStep: 1,
      };
    }
    case 'OPEN_PROJECT': {
      const projectToOpen = state.projects.find((project) => project.id === action.payload);
      if (!projectToOpen) return state;

      const normalizedProject = normalizeProject(projectToOpen);

      return {
        ...state,
        projects: upsertProject(state.projects, normalizedProject),
        project: normalizedProject,
        activeProjectId: normalizedProject.id,
        currentScreen: 'editor',
        mode: 'editor',
        activeSceneIndex: 0,
        ...getSelectionState(null),
        selectedSequenceStep: null,
        presentationSceneIndex: 0,
        presentationRevealStep: 1,
      };
    }
    case 'SAVE_PROJECT':
      return applyProjectUpdate(state, state.project);
    case 'DELETE_PROJECT': {
      const nextProjects = state.projects.filter((project) => project.id !== action.payload);
      const isDeletingActiveProject = state.activeProjectId === action.payload;

      return {
        ...state,
        projects: nextProjects,
        project: isDeletingActiveProject ? createEmptyProject() : state.project,
        activeProjectId: isDeletingActiveProject ? null : state.activeProjectId,
        currentScreen: isDeletingActiveProject ? 'projects' : state.currentScreen,
        mode: 'editor',
        activeSceneIndex: isDeletingActiveProject ? 0 : state.activeSceneIndex,
        ...getSelectionState(null),
        selectedSequenceStep: null,
        presentationSceneIndex: 0,
        presentationRevealStep: 1,
      };
    }
    case 'USE_TEMPLATE': {
      const template = state.templates.find((entry) => entry.id === action.payload);
      if (!template) return state;

      const nextProject = template.kind === 'branch'
        ? buildBranchFromTemplate(state.project, state.activeSceneIndex, template)
        : buildSceneFromTemplate(state.project, template);
      return applyProjectUpdate(state, nextProject, {
        activeSceneIndex: template.kind === 'branch' ? state.activeSceneIndex : nextProject.scenes.length - 1,
        ...getSelectionState(null),
        selectedSequenceStep:
          template.kind === 'branch'
            ? getSceneSequenceCount(state.project.scenes[state.activeSceneIndex]) + 1
            : null,
      });
    }
    case 'SET_SCREEN':
      return {
        ...state,
        currentScreen: action.payload,
        mode: action.payload === 'projects' ? 'editor' : state.mode,
        ...getSelectionState(null),
        selectedSequenceStep: null,
      };
    case 'SET_MODE':
      return {
        ...state,
        mode: action.payload,
        presentationSceneIndex: action.payload === 'presentation' ? state.activeSceneIndex : state.presentationSceneIndex,
        presentationRevealStep: 1,
        ...getSelectionState(null),
        selectedSequenceStep: null,
      };
    case 'SET_ACTIVE_SCENE':
      return { ...state, activeSceneIndex: action.payload, ...getSelectionState(null), selectedSequenceStep: null };
    case 'ADD_SCENE': {
      const nextProject = {
        ...state.project,
        scenes: [...state.project.scenes, cloneScene(action.payload)],
      };

      return applyProjectUpdate(state, nextProject, {
        activeSceneIndex: state.project.scenes.length,
        ...getSelectionState(null),
        selectedSequenceStep: null,
      });
    }
    case 'DUPLICATE_SCENE': {
      const sceneToDuplicate = state.project.scenes[action.payload];
      if (!sceneToDuplicate) return state;

      const newScene = cloneScene(sceneToDuplicate, {
        id: generateId(),
        name: `${sceneToDuplicate.name} (Copy)`,
        elements: sceneToDuplicate.elements.map((element) => cloneElement(element, { id: generateId() })),
      });

      const nextScenes = [...state.project.scenes];
      nextScenes.splice(action.payload + 1, 0, newScene);

      return applyProjectUpdate(state, { ...state.project, scenes: nextScenes }, {
        activeSceneIndex: action.payload + 1,
      });
    }
    case 'MOVE_SCENE': {
      const { fromIndex, toIndex } = action.payload;
      const sceneCount = state.project.scenes.length;

      if (
        fromIndex < 0 ||
        fromIndex >= sceneCount ||
        toIndex < 0 ||
        toIndex >= sceneCount ||
        fromIndex === toIndex
      ) {
        return state;
      }

      const activeSceneId = state.project.scenes[state.activeSceneIndex]?.id;
      const presentationSceneId = state.project.scenes[state.presentationSceneIndex]?.id;
      const nextScenes = [...state.project.scenes];
      const [movedScene] = nextScenes.splice(fromIndex, 1);
      nextScenes.splice(toIndex, 0, movedScene);

      return applyProjectUpdate(state, { ...state.project, scenes: nextScenes }, {
        activeSceneIndex: Math.max(0, nextScenes.findIndex((scene) => scene.id === activeSceneId)),
        presentationSceneIndex: Math.max(0, nextScenes.findIndex((scene) => scene.id === presentationSceneId)),
      });
    }
    case 'DELETE_SCENE': {
      if (state.project.scenes.length <= 1) return state;
      const nextScenes = state.project.scenes.filter((_, index) => index !== action.payload);

      return applyProjectUpdate(state, { ...state.project, scenes: nextScenes }, {
        activeSceneIndex: Math.min(state.activeSceneIndex, nextScenes.length - 1),
        ...getSelectionState(null),
      });
    }
    case 'UPDATE_SCENE': {
      const nextScenes = [...state.project.scenes];
      nextScenes[action.payload.index] = cloneScene(action.payload.scene);

      return applyProjectUpdate(state, { ...state.project, scenes: nextScenes });
    }
    case 'ADD_ASSET':
      return applyProjectUpdate(state, {
        ...state.project,
        assets: mergeAssetLibraries(state.project.assets, [normalizeAsset(action.payload)]),
      });
    case 'DELETE_ASSET':
      return applyProjectUpdate(state, {
        ...state.project,
        assets: state.project.assets.filter((asset) => asset.id !== action.payload),
      });
    case 'ADD_SHARED_ASSET':
      return {
        ...state,
        sharedAssets: mergeAssetLibraries(state.sharedAssets, [normalizeAsset(action.payload)]),
      };
    case 'DELETE_SHARED_ASSET':
      return {
        ...state,
        sharedAssets: state.sharedAssets.filter((asset) => asset.id !== action.payload),
        favoriteComponents: state.favoriteComponents.filter(
          (favorite) => !(favorite.type === 'asset' && favorite.id === action.payload),
        ),
      };
    case 'UPSERT_SHARED_SAVED_COMPONENT': {
      const existingIndex = state.sharedSavedComponents.findIndex(
        (component) => component.id === action.payload.id,
      );

      if (existingIndex === -1) {
        return {
          ...state,
          sharedSavedComponents: [action.payload, ...state.sharedSavedComponents],
        };
      }

      const nextSharedSavedComponents = [...state.sharedSavedComponents];
      nextSharedSavedComponents[existingIndex] = action.payload;

      return {
        ...state,
        sharedSavedComponents: nextSharedSavedComponents,
      };
    }
    case 'DELETE_SHARED_SAVED_COMPONENT':
      return {
        ...state,
        sharedSavedComponents: state.sharedSavedComponents.filter(
          (component) => component.id !== action.payload,
        ),
      };
    case 'DELETE_SAVED_COMPONENT':
      return {
        ...state,
        sharedSavedComponents: state.sharedSavedComponents.filter(
          (component) => component.id !== action.payload,
        ),
        favoriteComponents: state.favoriteComponents.filter(
          (favorite) => !(favorite.type === 'saved-element' && favorite.id === action.payload),
        ),
      };
    case 'UPDATE_PROJECT_NAME':
      return applyProjectUpdate(state, { ...state.project, name: action.payload });
    case 'ADD_TEMPLATE':
      return {
        ...state,
        templates: upsertTemplate(state.templates, normalizeTemplate(action.payload, action.payload.assets)),
      };
    case 'TOGGLE_FAVORITE_COMPONENT': {
      const exists = state.favoriteComponents.some(
        (favorite) => favorite.type === action.payload.type && favorite.id === action.payload.id,
      );

      return {
        ...state,
        favoriteComponents: exists
          ? state.favoriteComponents.filter(
              (favorite) => !(favorite.type === action.payload.type && favorite.id === action.payload.id),
            )
          : [...state.favoriteComponents, action.payload],
      };
    }
    case 'UPSERT_FAVORITE_COMPONENT': {
      const existingIndex = state.favoriteComponents.findIndex(
        (favorite) => favorite.type === action.payload.type && favorite.id === action.payload.id,
      );

      if (existingIndex === -1) {
        return {
          ...state,
          favoriteComponents: [action.payload, ...state.favoriteComponents],
        };
      }

      const nextFavorites = [...state.favoriteComponents];
      nextFavorites[existingIndex] = action.payload;

      return {
        ...state,
        favoriteComponents: nextFavorites,
      };
    }
    case 'DELETE_TEMPLATE':
      return {
        ...state,
        templates: state.templates.filter((template) => template.id !== action.payload),
      };
    case 'UPDATE_TEMPLATE':
      return {
        ...state,
        templates: state.templates.map((template) =>
          template.id === action.payload.id
            ? {
                ...template,
                name: action.payload.name,
                scene: { ...template.scene, name: action.payload.name },
                updatedAt: getTimestamp(),
              }
            : template,
        ),
      };
    case 'SELECT_ELEMENT':
      return { ...state, ...getSelectionState(action.payload) };
    case 'SELECT_ELEMENTS':
      return { ...state, ...getMultiSelectionState(action.payload) };
    case 'TOGGLE_ELEMENT_SELECTION': {
      const isSelected = state.selectedElementIds.includes(action.payload);
      const nextSelectedElementIds = isSelected
        ? state.selectedElementIds.filter((elementId) => elementId !== action.payload)
        : [...state.selectedElementIds, action.payload];

      return { ...state, ...getMultiSelectionState(nextSelectedElementIds) };
    }
    case 'SELECT_SEQUENCE':
      return { ...state, selectedSequenceStep: action.payload };
    case 'ADD_ELEMENT': {
      const activeScene = state.project.scenes[state.activeSceneIndex];
      const nextScene = {
        ...activeScene,
        elements: [...activeScene.elements, cloneElement(action.payload, { zIndex: getNextElementZIndex(activeScene.elements) })],
      };
      const nextScenes = [...state.project.scenes];
      nextScenes[state.activeSceneIndex] = nextScene;

      return applyProjectUpdate(state, { ...state.project, scenes: nextScenes }, {
        ...getSelectionState(action.payload.id),
      });
    }
    case 'UPDATE_ELEMENT': {
      const activeScene = state.project.scenes[state.activeSceneIndex];

      const nextElements = activeScene.elements.map((element) => {
        if (element.id !== action.payload.id) return element;

        return applyElementUpdates(element, action.payload.updates, state.selectedSequenceStep);
      });

      const nextScenes = [...state.project.scenes];
      nextScenes[state.activeSceneIndex] = { ...activeScene, elements: nextElements };

      return applyProjectUpdate(state, { ...state.project, scenes: nextScenes });
    }
    case 'REPLACE_ELEMENT': {
      const activeScene = state.project.scenes[state.activeSceneIndex];
      const elementToReplace = activeScene.elements.find(
        (element) => element.id === action.payload.id,
      );
      if (!elementToReplace) return state;

      const nextElements = activeScene.elements.map((element) => {
        if (element.id !== action.payload.id) return element;

        return replaceElementContent(elementToReplace, action.payload.element);
      });

      const nextScenes = [...state.project.scenes];
      nextScenes[state.activeSceneIndex] = { ...activeScene, elements: nextElements };

      return applyProjectUpdate(state, { ...state.project, scenes: nextScenes });
    }
    case 'DELETE_ELEMENT': {
      const activeScene = state.project.scenes[state.activeSceneIndex];
      const nextElements = activeScene.elements.filter((element) => element.id !== action.payload);
      const nextScenes = [...state.project.scenes];
      nextScenes[state.activeSceneIndex] = { ...activeScene, elements: nextElements };

      return applyProjectUpdate(state, { ...state.project, scenes: nextScenes }, {
        ...getMultiSelectionState(
          state.selectedElementIds.filter((elementId) => elementId !== action.payload),
        ),
      });
    }
    case 'DELETE_ELEMENTS': {
      const idsToDelete = new Set(action.payload);
      if (idsToDelete.size === 0) return state;

      const activeScene = state.project.scenes[state.activeSceneIndex];
      const nextElements = activeScene.elements.filter((element) => !idsToDelete.has(element.id));
      const nextScenes = [...state.project.scenes];
      nextScenes[state.activeSceneIndex] = { ...activeScene, elements: nextElements };

      return applyProjectUpdate(state, { ...state.project, scenes: nextScenes }, {
        ...getSelectionState(null),
      });
    }
    case 'DUPLICATE_ELEMENT': {
      const activeScene = state.project.scenes[state.activeSceneIndex];
      const elementToDuplicate = activeScene.elements.find((element) => element.id === action.payload);
      if (!elementToDuplicate) return state;

      const newElement = cloneElement(elementToDuplicate, {
        id: generateId(),
        x: elementToDuplicate.x + 20,
        y: elementToDuplicate.y + 20,
        zIndex: getNextElementZIndex(activeScene.elements),
      });
      const nextScenes = [...state.project.scenes];
      nextScenes[state.activeSceneIndex] = {
        ...activeScene,
        elements: [...activeScene.elements, newElement],
      };

      return applyProjectUpdate(state, { ...state.project, scenes: nextScenes }, {
        ...getSelectionState(newElement.id),
      });
    }
    case 'DUPLICATE_ELEMENTS': {
      const activeScene = state.project.scenes[state.activeSceneIndex];
      const sourceElements = activeScene.elements.filter((element) => action.payload.includes(element.id));
      if (sourceElements.length === 0) return state;

      let nextZIndex = getNextElementZIndex(activeScene.elements);
      const duplicatedElements = sourceElements.map((element) => {
        const newElement = cloneElement(element, {
          id: generateId(),
          x: element.x + 20,
          y: element.y + 20,
          zIndex: nextZIndex,
        });
        nextZIndex += 1;
        return newElement;
      });
      const nextScenes = [...state.project.scenes];
      nextScenes[state.activeSceneIndex] = {
        ...activeScene,
        elements: [...activeScene.elements, ...duplicatedElements],
      };

      return applyProjectUpdate(state, { ...state.project, scenes: nextScenes }, {
        ...getMultiSelectionState(duplicatedElements.map((element) => element.id)),
      });
    }
    case 'SET_PRESENTATION_SCENE':
      return { ...state, presentationSceneIndex: action.payload };
    case 'SET_PRESENTATION_STEP':
      return { ...state, presentationRevealStep: action.payload };
    case 'ADD_SEQUENCE': {
      const nextScenes = [...state.project.scenes];
      const { sceneIndex, position = 'end' } = action.payload;
      const scene = nextScenes[sceneIndex];
      if (!scene) return state;

      const nextSequenceCount = (scene.sequenceCount || 1) + 1;

      if (position === 'start') {
        const nextElements = scene.elements.map((element) => {
          const shiftedKeyframes = element.keyframes
            ? Object.fromEntries(
                Object.entries(element.keyframes).map(([step, keyframe]) => [Number(step) + 1, { ...keyframe }]),
              )
            : undefined;

          return cloneElement(element, {
            revealStep: element.revealStep + 1,
            hideStep: element.hideStep != null ? element.hideStep + 1 : element.hideStep,
            keyframes: shiftedKeyframes,
          });
        });

        const nextSequences = (scene.sequences || []).map((sequence) => ({
          ...sequence,
          step: sequence.step + 1,
        }));

        nextScenes[sceneIndex] = {
          ...scene,
          sequenceCount: nextSequenceCount,
          elements: nextElements,
          sequences: nextSequences,
        };

        return applyProjectUpdate(state, { ...state.project, scenes: nextScenes }, {
          selectedSequenceStep: 1,
        });
      }

      nextScenes[sceneIndex] = {
        ...scene,
        sequenceCount: nextSequenceCount,
      };

      return applyProjectUpdate(state, { ...state.project, scenes: nextScenes }, {
        selectedSequenceStep: nextSequenceCount,
      });
    }
    case 'DELETE_SEQUENCE': {
      const { sceneIndex, sequenceStep } = action.payload;
      const nextScenes = [...state.project.scenes];
      const scene = nextScenes[sceneIndex];
      if (!scene) return state;

      const nextSequenceCount = Math.max(1, (scene.sequenceCount || 1) - 1);
      const nextElements = scene.elements.map((element) => {
        const nextHideStep =
          element.hideStep == null
            ? element.hideStep
            : element.hideStep > sequenceStep
              ? element.hideStep - 1
              : element.hideStep;

        if (element.revealStep === sequenceStep) {
          return cloneElement(element, {
            revealStep: Math.max(1, sequenceStep - 1),
            hideStep: nextHideStep,
            keyframes: shiftKeyframesAfterDeletedStep(element.keyframes, sequenceStep),
          });
        }
        if (element.revealStep > sequenceStep) {
          return cloneElement(element, {
            revealStep: element.revealStep - 1,
            hideStep: nextHideStep,
            keyframes: shiftKeyframesAfterDeletedStep(element.keyframes, sequenceStep),
          });
        }
        return cloneElement(element, {
          hideStep: nextHideStep,
          keyframes: shiftKeyframesAfterDeletedStep(element.keyframes, sequenceStep),
        });
      });

      const nextSequences = (scene.sequences || [])
        .filter((sequence) => sequence.step !== sequenceStep)
        .map((sequence) => (sequence.step > sequenceStep ? { ...sequence, step: sequence.step - 1 } : sequence));

      nextScenes[sceneIndex] = {
        ...scene,
        sequenceCount: nextSequenceCount,
        elements: nextElements,
        sequences: nextSequences,
      };

      return applyProjectUpdate(state, { ...state.project, scenes: nextScenes }, {
        selectedSequenceStep:
          state.selectedSequenceStep === sequenceStep
            ? null
            : state.selectedSequenceStep && state.selectedSequenceStep > sequenceStep
              ? state.selectedSequenceStep - 1
              : state.selectedSequenceStep,
      });
    }
    case 'UPDATE_SEQUENCE_CONFIG': {
      const { sceneIndex, step, config } = action.payload;
      const nextScenes = [...state.project.scenes];
      const scene = nextScenes[sceneIndex];
      if (!scene) return state;

      const sequences = scene.sequences || [];
      const existingConfigIndex = sequences.findIndex((sequence) => sequence.step === step);
      const nextSequences = [...sequences];

      if (existingConfigIndex >= 0) {
        nextSequences[existingConfigIndex] = { ...nextSequences[existingConfigIndex], ...config };
      } else {
        nextSequences.push({
          step,
          animationType: DEFAULT_SEQUENCE_ANIMATION_TYPE,
          duration: DEFAULT_SEQUENCE_DURATION,
          delay: DEFAULT_SEQUENCE_DELAY,
          ...config,
        });
      }

      nextScenes[sceneIndex] = { ...scene, sequences: nextSequences };

      return applyProjectUpdate(state, { ...state.project, scenes: nextScenes });
    }
    default:
      return state;
  }
}

function shouldTrackHistory(action: Action) {
  return TRACKED_ACTIONS.has(action.type);
}

function createHistoryState(present: AppState): HistoryState {
  return {
    past: [],
    present,
    future: [],
  };
}

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === 'UNDO') {
    const previousState = state.past[state.past.length - 1];
    if (!previousState) {
      return state;
    }

    return {
      past: state.past.slice(0, -1),
      present: previousState,
      future: [state.present, ...state.future],
    };
  }

  if (action.type === 'REDO') {
    const nextState = state.future[0];
    if (!nextState) {
      return state;
    }

    return {
      past: [...state.past, state.present],
      present: nextState,
      future: state.future.slice(1),
    };
  }

  const nextPresent = appReducer(state.present, action);
  if (nextPresent === state.present) {
    return state;
  }

  if (nextPresent.activeProjectId !== state.present.activeProjectId) {
    return createHistoryState(nextPresent);
  }

  if (!shouldTrackHistory(action)) {
    return {
      ...state,
      present: nextPresent,
    };
  }

  const nextPast =
    state.past.length >= HISTORY_LIMIT
      ? [...state.past.slice(1), state.present]
      : [...state.past, state.present];

  return {
    past: nextPast,
    present: nextPresent,
    future: [],
  };
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<HistoryAction>;
  canUndo: boolean;
  canRedo: boolean;
} | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [historyState, dispatch] = useReducer(historyReducer, initialState, createHistoryState);

  const { past, present, future } = historyState;

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const persistedLibrary = await loadPersistedLibrary();
        if (cancelled) {
          return;
        }

        if (persistedLibrary) {
          dispatch({ type: 'HYDRATE', payload: persistedLibrary });
          clearLegacyLocalStorage();
          return;
        }

        const legacyLibrary = loadLegacyLibraryFromLocalStorage();
        if (cancelled) {
          return;
        }

        if (legacyLibrary) {
          await savePersistedLibrary(legacyLibrary);
          if (cancelled) {
            return;
          }
        }

        dispatch({ type: 'HYDRATE', payload: legacyLibrary });
        clearLegacyLocalStorage();
      } catch (error) {
        console.error('Failed to hydrate local project library', error);
        dispatch({ type: 'HYDRATE', payload: loadLegacyLibraryFromLocalStorage() });
      }
    };

    hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!present.isHydrated) {
      return;
    }

    savePersistedLibrary({
      activeProjectId: present.activeProjectId,
      projects: present.projects,
      sharedAssetsVersion: EXPLICIT_SHARED_ASSETS_VERSION,
      sharedAssets: present.sharedAssets,
      sharedSavedComponents: present.sharedSavedComponents,
      favorites: present.favoriteComponents,
      templates: present.templates,
    }).catch((error) => {
      console.error('Failed to persist local project library', error);
    });
  }, [
    present.activeProjectId,
    present.favoriteComponents,
    present.isHydrated,
    present.projects,
    present.sharedAssets,
    present.sharedSavedComponents,
    present.templates,
  ]);

  return (
    <AppContext.Provider
      value={{
        state: present,
        dispatch,
        canUndo: past.length > 0,
        canRedo: future.length > 0,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
