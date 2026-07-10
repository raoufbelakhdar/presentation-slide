import React, { createContext, useContext, useEffect, useReducer, ReactNode } from 'react';
import { AppMode, AppScreen, Asset, Project, Scene, SceneElement, SceneTemplate } from './types';
import { buildSceneTemplate, generateId } from './utils';

const PROJECT_LIBRARY_KEY = 'visual-learning-projects';
const TEMPLATE_LIBRARY_KEY = 'visual-learning-templates';
const LEGACY_PROJECT_KEY = 'visual-learning-project';

interface AppState {
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
  | { type: 'ADD_SEQUENCE'; payload: number }
  | { type: 'DELETE_SEQUENCE'; payload: { sceneIndex: number; sequenceStep: number } }
  | { type: 'SELECT_SEQUENCE'; payload: number | null }
  | { type: 'UPDATE_SEQUENCE_CONFIG'; payload: { sceneIndex: number; step: number; config: Partial<import('./types').SequenceConfig> } }
  | { type: 'DELETE_TEMPLATE'; payload: string }
  | { type: 'UPDATE_TEMPLATE'; payload: { id: string; name: string } };

function getTimestamp() {
  return new Date().toISOString();
}

function cloneElement(element: SceneElement, overrides: Partial<SceneElement> = {}): SceneElement {
  return {
    ...element,
    ...overrides,
    keyframes: element.keyframes
      ? Object.fromEntries(
          Object.entries(element.keyframes).map(([step, keyframe]) => [Number(step), { ...keyframe }]),
        )
      : undefined,
  } as SceneElement;
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
    elements: Array.isArray(scene?.elements) ? scene.elements.map((element) => cloneElement(element as SceneElement)) : [],
    sequenceCount: scene?.sequenceCount,
    sequences: Array.isArray(scene?.sequences) ? scene.sequences.map((sequence) => ({ ...sequence })) : undefined,
  };
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

const initialState: AppState = {
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
    case 'LOAD_PROJECT': {
      const importedProject = createImportedProject(action.payload);
      const importedTemplates = Array.isArray(action.payload.templates)
        ? action.payload.templates.map((template) =>
            buildSceneTemplate(normalizeScene(template), importedProject.assets, template.name || 'Imported Template'),
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

      const nextProject = buildSceneFromTemplate(state.project, template);
      return applyProjectUpdate(state, nextProject, {
        activeSceneIndex: nextProject.scenes.length - 1,
        selectedElementId: null,
        selectedSequenceStep: null,
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
      const nextScene = { ...activeScene, elements: [...activeScene.elements, cloneElement(action.payload)] };
      const nextScenes = [...state.project.scenes];
      nextScenes[state.activeSceneIndex] = nextScene;

      return applyProjectUpdate(state, { ...state.project, scenes: nextScenes }, {
        selectedElementId: action.payload.id,
      });
    }
    case 'UPDATE_ELEMENT': {
      const activeScene = state.project.scenes[state.activeSceneIndex];
      const sequenceStep = state.selectedSequenceStep;

      const nextElements = activeScene.elements.map((element) => {
        if (element.id !== action.payload.id) return element;

        const updates = { ...action.payload.updates };

        if (sequenceStep !== null && sequenceStep > element.revealStep) {
          const layoutKeys = ['x', 'y', 'width', 'height', 'hidden'];
          const keyframeUpdates: Partial<SceneElement> = {};
          let hasKeyframeUpdates = false;

          for (const key of layoutKeys) {
            if (key in updates) {
              keyframeUpdates[key as keyof SceneElement] = updates[key as keyof typeof updates] as never;
              delete updates[key as keyof typeof updates];
              hasKeyframeUpdates = true;
            }
          }

          if (hasKeyframeUpdates) {
            const nextKeyframes = { ...(element.keyframes || {}) };
            nextKeyframes[sequenceStep] = { ...(nextKeyframes[sequenceStep] || {}), ...keyframeUpdates };
            updates.keyframes = nextKeyframes;
          }
        }

        return cloneElement(element, updates);
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
      const scene = nextScenes[action.payload];
      if (!scene) return state;

      nextScenes[action.payload] = {
        ...scene,
        sequenceCount: (scene.sequenceCount || 1) + 1,
      };

      return applyProjectUpdate(state, { ...state.project, scenes: nextScenes });
    }
    case 'DELETE_SEQUENCE': {
      const { sceneIndex, sequenceStep } = action.payload;
      const nextScenes = [...state.project.scenes];
      const scene = nextScenes[sceneIndex];
      if (!scene) return state;

      const nextSequenceCount = Math.max(1, (scene.sequenceCount || 1) - 1);
      const nextElements = scene.elements.map((element) => {
        if (element.revealStep === sequenceStep) {
          return cloneElement(element, { revealStep: Math.max(1, sequenceStep - 1) });
        }
        if (element.revealStep > sequenceStep) {
          return cloneElement(element, { revealStep: element.revealStep - 1 });
        }
        return element;
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
          animationType: 'fade',
          duration: 0.4,
          delay: 0,
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

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
} | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState, (initial) => {
    try {
      const storedProjects = localStorage.getItem(PROJECT_LIBRARY_KEY);
      const storedTemplates = localStorage.getItem(TEMPLATE_LIBRARY_KEY);
      const legacyProject = localStorage.getItem(LEGACY_PROJECT_KEY);

      let rawProjects: Partial<Project>[] = [];

      if (storedProjects) {
        const parsedProjects = JSON.parse(storedProjects);
        if (Array.isArray(parsedProjects)) {
          rawProjects = parsedProjects;
        }
      } else if (legacyProject) {
        rawProjects = [JSON.parse(legacyProject)];
      }

      const projects = rawProjects.map((project) => normalizeProject(project));
      let templates: SceneTemplate[] = [];

      if (storedTemplates) {
        const parsedTemplates = JSON.parse(storedTemplates);
        if (Array.isArray(parsedTemplates)) {
          templates = parsedTemplates.map((template) => normalizeTemplate(template));
        }
      }

      if (templates.length === 0 && rawProjects.length > 0) {
        templates = collectLegacyTemplates(rawProjects);
      }

      return {
        ...initial,
        projects,
        templates,
        project: projects[0] || initial.project,
      };
    } catch (error) {
      console.error('Failed to load projects from local storage', error);
      return initial;
    }
  });

  useEffect(() => {
    localStorage.setItem(PROJECT_LIBRARY_KEY, JSON.stringify(state.projects));
    localStorage.setItem(TEMPLATE_LIBRARY_KEY, JSON.stringify(state.templates));
    localStorage.removeItem(LEGACY_PROJECT_KEY);
  }, [state.projects, state.templates]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
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
