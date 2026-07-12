import React, { createContext, useContext, useEffect, useReducer, ReactNode } from 'react';
import {
  AppMode,
  AppScreen,
  Asset,
  DEFAULT_SEQUENCE_ANIMATION_TYPE,
  DEFAULT_SEQUENCE_DELAY,
  DEFAULT_SEQUENCE_DURATION,
  Project,
  Scene,
  SceneElement,
  SceneTemplate,
} from './types';
import { loadPersistedLibrary, PersistedLibraryRecord, savePersistedLibrary } from './persistence';
import { buildSceneTemplate, generateId, getSceneSequenceCount } from './utils';

const PROJECT_LIBRARY_KEY = 'visual-learning-projects';
const TEMPLATE_LIBRARY_KEY = 'visual-learning-templates';
const LEGACY_PROJECT_KEY = 'visual-learning-project';

interface AppState {
  isHydrated: boolean;
  projects: Project[];
  templates: SceneTemplate[];
  project: Project;
  activeProjectId: string | null;
  currentScreen: AppScreen;
  activeSceneIndex: number;
  selectedElementId: string | null;
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
  | { type: 'UPDATE_PROJECT_NAME'; payload: string }
  | { type: 'ADD_TEMPLATE'; payload: SceneTemplate }
  | { type: 'SELECT_ELEMENT'; payload: string | null }
  | { type: 'ADD_ELEMENT'; payload: SceneElement }
  | { type: 'UPDATE_ELEMENT'; payload: { id: string; updates: Partial<SceneElement> } }
  | { type: 'DELETE_ELEMENT'; payload: string }
  | { type: 'DUPLICATE_ELEMENT'; payload: string }
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

const TRACKED_ACTIONS = new Set<Action['type']>([
  'USE_TEMPLATE',
  'ADD_SCENE',
  'DUPLICATE_SCENE',
  'MOVE_SCENE',
  'DELETE_SCENE',
  'UPDATE_SCENE',
  'ADD_ASSET',
  'DELETE_ASSET',
  'UPDATE_PROJECT_NAME',
  'ADD_TEMPLATE',
  'DELETE_TEMPLATE',
  'UPDATE_TEMPLATE',
  'ADD_ELEMENT',
  'UPDATE_ELEMENT',
  'DELETE_ELEMENT',
  'DUPLICATE_ELEMENT',
  'ADD_SEQUENCE',
  'DELETE_SEQUENCE',
  'UPDATE_SEQUENCE_CONFIG',
]);

function getTimestamp() {
  return new Date().toISOString();
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

function normalizeScene(scene: Partial<Scene> | null | undefined, index = 0): Scene {
  return {
    id: scene?.id || generateId(),
    name: scene?.name || `Scene ${index + 1}`,
    elements: Array.isArray(scene?.elements)
      ? scene.elements.map((element, elementIndex) =>
          cloneElement(element as SceneElement, {
            zIndex: (element as SceneElement).zIndex ?? elementIndex,
          }),
        )
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
  const scenes = Array.isArray(project?.scenes) && project.scenes.length > 0
    ? project.scenes.map((scene, index) => normalizeScene(scene, index))
    : [createDefaultScene()];

  return {
    id: project?.id || fallback.id,
    name: project?.name || fallback.name,
    scenes,
    assets: Array.isArray(project?.assets) ? project.assets.map((asset) => ({ ...asset })) : [],
    templates: [],
    createdAt: project?.createdAt || project?.updatedAt || fallback.createdAt,
    updatedAt: project?.updatedAt || project?.createdAt || fallback.updatedAt,
  };
}

function normalizeTemplate(template: Partial<SceneTemplate> | null | undefined, fallbackAssets: Asset[] = []): SceneTemplate {
  const normalizedScene = normalizeScene(template?.scene || (template as unknown as Scene));
  const assets = Array.isArray(template?.assets)
    ? template.assets.map((asset) => ({ ...asset }))
    : fallbackAssets.map((asset) => ({ ...asset }));
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

  return {
    ...state,
    ...overrides,
    project: savedProject,
    activeProjectId,
    projects: upsertProject(state.projects, savedProject),
  };
}

function collectLegacyTemplates(rawProjects: Partial<Project>[]): SceneTemplate[] {
  const templates: SceneTemplate[] = [];

  for (const rawProject of rawProjects) {
    const assets = Array.isArray(rawProject.assets) ? rawProject.assets.map((asset) => ({ ...asset })) : [];
    const rawTemplates = Array.isArray(rawProject.templates) ? rawProject.templates : [];

    for (const rawTemplate of rawTemplates) {
      const normalizedScene = normalizeScene(rawTemplate);
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
    templates,
    project: activeProject || baseState.project,
    activeProjectId,
  };
}

function loadLegacyLibraryFromLocalStorage(): PersistedLibraryRecord | null {
  const storedProjects = parseStoredJson<Partial<Project>[]>(localStorage.getItem(PROJECT_LIBRARY_KEY));
  const storedTemplates = parseStoredJson<SceneTemplate[]>(localStorage.getItem(TEMPLATE_LIBRARY_KEY));
  const legacyProject = parseStoredJson<Partial<Project>>(localStorage.getItem(LEGACY_PROJECT_KEY));

  const rawProjects = Array.isArray(storedProjects)
    ? storedProjects
    : legacyProject
      ? [legacyProject]
      : [];

  if (rawProjects.length === 0 && !Array.isArray(storedTemplates)) {
    return null;
  }

  const projects = rawProjects.map((project) => normalizeProject(project));
  const templates = Array.isArray(storedTemplates)
    ? storedTemplates.map((template) => normalizeTemplate(template))
    : collectLegacyTemplates(rawProjects);

  return {
    activeProjectId: projects[0]?.id || null,
    projects,
    templates,
  };
}

function clearLegacyLocalStorage() {
  localStorage.removeItem(PROJECT_LIBRARY_KEY);
  localStorage.removeItem(TEMPLATE_LIBRARY_KEY);
  localStorage.removeItem(LEGACY_PROJECT_KEY);
}

const initialState: AppState = {
  isHydrated: false,
  projects: [],
  templates: [],
  project: createEmptyProject(),
  activeProjectId: null,
  currentScreen: 'projects',
  activeSceneIndex: 0,
  selectedElementId: null,
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
        selectedElementId: null,
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
        selectedElementId: null,
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
        selectedElementId: null,
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
        selectedElementId: null,
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
        selectedElementId: null,
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
        selectedElementId: null,
        selectedSequenceStep: null,
      };
    case 'SET_MODE':
      return {
        ...state,
        mode: action.payload,
        presentationSceneIndex: action.payload === 'presentation' ? state.activeSceneIndex : state.presentationSceneIndex,
        presentationRevealStep: 1,
        selectedElementId: null,
        selectedSequenceStep: null,
      };
    case 'SET_ACTIVE_SCENE':
      return { ...state, activeSceneIndex: action.payload, selectedElementId: null, selectedSequenceStep: null };
    case 'ADD_SCENE': {
      const nextProject = {
        ...state.project,
        scenes: [...state.project.scenes, cloneScene(action.payload)],
      };

      return applyProjectUpdate(state, nextProject, {
        activeSceneIndex: state.project.scenes.length,
        selectedElementId: null,
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
        selectedElementId: null,
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
        assets: [...state.project.assets, { ...action.payload }],
      });
    case 'DELETE_ASSET':
      return applyProjectUpdate(state, {
        ...state.project,
        assets: state.project.assets.filter((asset) => asset.id !== action.payload),
      });
    case 'UPDATE_PROJECT_NAME':
      return applyProjectUpdate(state, { ...state.project, name: action.payload });
    case 'ADD_TEMPLATE':
      return {
        ...state,
        templates: upsertTemplate(state.templates, normalizeTemplate(action.payload, action.payload.assets)),
      };
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
      return { ...state, selectedElementId: action.payload };
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
        selectedElementId: action.payload.id,
      });
    }
    case 'UPDATE_ELEMENT': {
      const activeScene = state.project.scenes[state.activeSceneIndex];

      const nextElements = activeScene.elements.map((element) => {
        if (element.id !== action.payload.id) return element;

        return cloneElement(element, action.payload.updates);
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
        selectedElementId: state.selectedElementId === action.payload ? null : state.selectedElementId,
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
        selectedElementId: newElement.id,
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
      templates: present.templates,
    }).catch((error) => {
      console.error('Failed to persist local project library', error);
    });
  }, [present.activeProjectId, present.isHydrated, present.projects, present.templates]);

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
