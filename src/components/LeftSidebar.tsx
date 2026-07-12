import React, { useDeferredValue, useEffect, useState } from 'react';
import { useAppContext } from '../AppContext';
import { Upload, Save, Copy, Plus, Trash2, Edit2, Check, X, GitBranch, Search, Star } from 'lucide-react';
import { buildSceneTemplate, generateId } from '../utils';
import { TextElement, ImageElement, ShapeElement, ColorElement } from '../types';
import { FEATURED_ICON_NAMES, LUCIDE_ICON_NAMES, searchLucideIcons } from '../iconLibrary';
import { LucideIconGlyph } from './LucideIconGlyph';

const FAVORITE_COMPONENTS_STORAGE_KEY = 'visual-learning-favorite-components';

type PresetId =
  | 'free-text'
  | 'text-block'
  | 'yes-badge'
  | 'no-badge'
  | 'color-card'
  | 'blue-check'
  | 'red-cross';

type FavoriteComponent =
  | { type: 'preset'; id: PresetId }
  | { type: 'icon'; id: string }
  | { type: 'asset'; id: string };

function TextPresetPreview({ block = false }: { block?: boolean }) {
  return (
    <div className={`flex h-12 w-16 shrink-0 overflow-hidden rounded-md border border-[#dbe4f0] ${
      block ? 'items-center justify-center bg-[#eff6ff]' : 'items-start justify-start bg-white p-2.5'
    }`}>
      {block ? (
        <div className="flex h-7 w-11 flex-col items-center justify-center rounded-full bg-[#3b82f6] px-2">
          <span className="h-1.5 w-6 rounded-full bg-white" />
          <span className="mt-1 h-1 w-4 rounded-full bg-white/85" />
        </div>
      ) : (
        <div className="w-full space-y-1">
          <div className="h-1.5 w-10 rounded-full bg-slate-700" />
          <div className="h-1.5 w-7 rounded-full bg-slate-400" />
          <div className="h-1.5 w-11 rounded-full bg-slate-300" />
          <div className="h-1.5 w-6 rounded-full bg-slate-200" />
        </div>
      )}
    </div>
  );
}

function BadgePresetPreview({ type }: { type: 'yes' | 'no' }) {
  const isYes = type === 'yes';

  return (
    <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md border border-[#dbe4f0] bg-white">
      <div className={`flex h-10 w-10 flex-col items-center justify-center rounded-full text-white shadow-sm ${
        isYes ? 'bg-[#3b82f6]' : 'bg-[#ef4444]'
      }`}>
        <span className="text-[4px] font-semibold uppercase tracking-[0.16em]">{isYes ? 'NAAM' : 'LA'}</span>
        <span className="mt-0.5 text-[6px] font-black uppercase">{isYes ? 'YES' : 'NO'}</span>
      </div>
    </div>
  );
}

function MarkPresetPreview({ type }: { type: 'check' | 'cross' }) {
  return (
    <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md border border-[#dbe4f0] bg-white">
      {type === 'check' ? (
        <Check className="h-8 w-8 text-sky-500" strokeWidth={3.5} />
      ) : (
        <X className="h-8 w-8 text-rose-500" strokeWidth={3.5} />
      )}
    </div>
  );
}

function ColorCardPresetPreview() {
  return (
    <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md border border-[#dbe4f0] bg-white">
      <div className="relative h-10 w-10 rounded-[3px] bg-[#f59e0b] shadow-sm">
        <div className="absolute inset-x-1.5 bottom-1.5 h-1 rounded-full bg-white/80" />
      </div>
    </div>
  );
}

function IconPresetPreview({ iconName }: { iconName: string }) {
  return (
    <div className="flex h-10 w-12 shrink-0 items-center justify-center rounded-md border border-[#dbe4f0] bg-white">
      <LucideIconGlyph name={iconName} className="h-5.5 w-5.5 text-[#0f172a]" color="#0f172a" strokeWidth={2.25} />
    </div>
  );
}

function PresetButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex aspect-[1.25/1] items-center justify-center rounded-sm border border-[#e2e8f0] bg-[#f8fafc] p-3 transition-colors hover:border-[#4f46e5]"
    >
      {children}
    </button>
  );
}

function FavoriteToggleButton({
  active,
  onClick,
  title,
  className = '',
}: {
  active: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  title: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`absolute z-10 rounded-full border p-1 shadow-sm backdrop-blur transition-colors ${active ? 'border-amber-300 bg-amber-50 text-amber-500' : 'border-white/70 bg-white/90 text-slate-400 hover:text-amber-500'} ${className}`}
    >
      <Star className={`h-3.5 w-3.5 ${active ? 'fill-current' : ''}`} />
    </button>
  );
}

export function LeftSidebar() {
  const { state, dispatch } = useAppContext();
  const { project, activeSceneIndex, templates, selectedSequenceStep } = state;
  const sceneTemplates = templates.filter((template) => (template.kind || 'scene') === 'scene');
  const branchTemplates = templates.filter((template) => template.kind === 'branch');
  const [activeTab, setActiveTab] = useState<'library' | 'templates'>('library');
  const [componentTab, setComponentTab] = useState<'favorites' | 'presets' | 'icons' | 'assets'>('favorites');
  const [templateTab, setTemplateTab] = useState<'scene' | 'branch'>('scene');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateName, setEditingTemplateName] = useState('');
  const [iconQuery, setIconQuery] = useState('');
  const [favoriteComponents, setFavoriteComponents] = useState<FavoriteComponent[]>(() => {
    if (typeof window === 'undefined') {
      return [];
    }

    const storedFavorites = window.localStorage.getItem(FAVORITE_COMPONENTS_STORAGE_KEY);
    if (!storedFavorites) {
      return [];
    }

    try {
      const parsed = JSON.parse(storedFavorites);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const defaultRevealStep = selectedSequenceStep ?? 1;
  const deferredIconQuery = useDeferredValue(iconQuery);
  const filteredIcons = deferredIconQuery.trim()
    ? searchLucideIcons(deferredIconQuery, 72)
    : FEATURED_ICON_NAMES;

  useEffect(() => {
    window.localStorage.setItem(FAVORITE_COMPONENTS_STORAGE_KEY, JSON.stringify(favoriteComponents));
  }, [favoriteComponents]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (typeof event.target?.result === 'string') {
          dispatch({
            type: 'ADD_ASSET',
            payload: {
              id: generateId(),
              name: file.name,
              dataUrl: event.target.result,
            },
          });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const addTextBlockElement = () => {
    const newElement: TextElement = {
      id: generateId(),
      type: 'text',
      variant: 'block',
      text: 'Main Title\nSubtitle text here',
      x: 100,
      y: 100,
      width: 400,
      height: 120,
      revealStep: defaultRevealStep,
      fontSize: 48,
      subtitleFontSize: 24,
      padding: 24,
      fontWeight: 'bold',
      color: '#ffffff',
    };
    dispatch({ type: 'ADD_ELEMENT', payload: newElement });
  };

  const addFreeTextElement = () => {
    const newElement: TextElement = {
      id: generateId(),
      type: 'text',
      variant: 'free',
      text: 'Add your text here',
      x: 120,
      y: 120,
      width: 520,
      height: 140,
      revealStep: defaultRevealStep,
      fontSize: 64,
      fontWeight: 'bold',
      color: '#0f172a',
    };
    dispatch({ type: 'ADD_ELEMENT', payload: newElement });
  };

  const addYesElement = () => {
    const newElement: ShapeElement = {
      id: generateId(),
      type: 'shape',
      shapeType: 'yes',
      x: 100,
      y: 100,
      width: 160,
      height: 160,
      revealStep: defaultRevealStep,
    };
    dispatch({ type: 'ADD_ELEMENT', payload: newElement });
  };

  const addNoElement = () => {
    const newElement: ShapeElement = {
      id: generateId(),
      type: 'shape',
      shapeType: 'no',
      x: 300,
      y: 100,
      width: 160,
      height: 160,
      revealStep: defaultRevealStep,
    };
    dispatch({ type: 'ADD_ELEMENT', payload: newElement });
  };

  const addCheckElement = () => {
    const newElement: ShapeElement = {
      id: generateId(),
      type: 'shape',
      shapeType: 'check',
      x: 120,
      y: 320,
      width: 180,
      height: 180,
      revealStep: defaultRevealStep,
    };
    dispatch({ type: 'ADD_ELEMENT', payload: newElement });
  };

  const addCrossElement = () => {
    const newElement: ShapeElement = {
      id: generateId(),
      type: 'shape',
      shapeType: 'cross',
      x: 340,
      y: 320,
      width: 180,
      height: 180,
      revealStep: defaultRevealStep,
    };
    dispatch({ type: 'ADD_ELEMENT', payload: newElement });
  };

  const addColorElement = () => {
    const newElement: ColorElement = {
      id: generateId(),
      type: 'color',
      fillColor: '#f59e0b',
      captionText: '',
      x: 180,
      y: 150,
      width: 300,
      height: 300,
      revealStep: defaultRevealStep,
    };
    dispatch({ type: 'ADD_ELEMENT', payload: newElement });
  };

  const addIconElement = (iconName: string) => {
    const newElement: ShapeElement = {
      id: generateId(),
      type: 'shape',
      shapeType: 'icon',
      iconName,
      iconColor: '#0f172a',
      iconStrokeWidth: 2.25,
      x: 160,
      y: 180,
      width: 180,
      height: 180,
      revealStep: defaultRevealStep,
    };
    dispatch({ type: 'ADD_ELEMENT', payload: newElement });
  };

  const addImageElement = (assetId: string) => {
    const newElement: ImageElement = {
      id: generateId(),
      type: 'image',
      assetId,
      captionText: '',
      x: 150,
      y: 150,
      width: 300,
      height: 300, // proportional scaling handled via resizer if needed, defaults are fine
      revealStep: defaultRevealStep,
    };
    dispatch({ type: 'ADD_ELEMENT', payload: newElement });
  };

  const presetDefinitions: Array<{
    id: PresetId;
    label: string;
    onClick: () => void;
    preview: React.ReactNode;
  }> = [
    { id: 'free-text', label: 'Free Text', onClick: addFreeTextElement, preview: <TextPresetPreview /> },
    { id: 'text-block', label: 'Text Block', onClick: addTextBlockElement, preview: <TextPresetPreview block /> },
    { id: 'yes-badge', label: 'Yes Badge', onClick: addYesElement, preview: <BadgePresetPreview type="yes" /> },
    { id: 'no-badge', label: 'No Badge', onClick: addNoElement, preview: <BadgePresetPreview type="no" /> },
    { id: 'color-card', label: 'Solid Color Card', onClick: addColorElement, preview: <ColorCardPresetPreview /> },
    { id: 'blue-check', label: 'Blue Check', onClick: addCheckElement, preview: <MarkPresetPreview type="check" /> },
    { id: 'red-cross', label: 'Red X', onClick: addCrossElement, preview: <MarkPresetPreview type="cross" /> },
  ];

  const presetDefinitionsById = new Map(presetDefinitions.map((preset) => [preset.id, preset]));

  const isFavorite = (favorite: FavoriteComponent) =>
    favoriteComponents.some((entry) => entry.type === favorite.type && entry.id === favorite.id);

  const toggleFavorite = (favorite: FavoriteComponent) => {
    setFavoriteComponents((currentFavorites) => {
      const exists = currentFavorites.some((entry) => entry.type === favorite.type && entry.id === favorite.id);
      if (exists) {
        return currentFavorites.filter((entry) => !(entry.type === favorite.type && entry.id === favorite.id));
      }

      return [...currentFavorites, favorite];
    });
  };

  const favoritePresets = favoriteComponents.filter(
    (favorite): favorite is Extract<FavoriteComponent, { type: 'preset' }> => favorite.type === 'preset',
  );
  const favoriteIcons = favoriteComponents.filter(
    (favorite): favorite is Extract<FavoriteComponent, { type: 'icon' }> => favorite.type === 'icon',
  );
  const favoriteAssets = favoriteComponents
    .filter((favorite): favorite is Extract<FavoriteComponent, { type: 'asset' }> => favorite.type === 'asset')
    .map((favorite) => project.assets.find((asset) => asset.id === favorite.id))
    .filter((asset): asset is typeof project.assets[number] => Boolean(asset));

  const getAssetUsageCount = (assetId: string) => {
    return project.scenes.reduce((count, scene) => {
      return count + scene.elements.filter((element) => element.type === 'image' && element.assetId === assetId).length;
    }, 0);
  };

  const deleteAsset = (assetId: string) => {
    const usageCount = getAssetUsageCount(assetId);
    const message = usageCount > 0
      ? `Remove this asset from the library? ${usageCount} image ${usageCount === 1 ? 'element still uses it' : 'elements still use it'} and will show "Image not found".`
      : 'Remove this asset from the library?';

    if (!confirm(message)) return;
    dispatch({ type: 'DELETE_ASSET', payload: assetId });
  };

  const saveCurrentAsTemplate = (kind: 'scene' | 'branch') => {
    const currentScene = project.scenes[activeSceneIndex];
    if (!currentScene) return;

    const templateName = kind === 'branch'
      ? `${currentScene.name} Branch`
      : `${currentScene.name} Template`;
    dispatch({
      type: 'ADD_TEMPLATE',
      payload: buildSceneTemplate(currentScene, project.assets, templateName, { kind }),
    });
  };

  const useTemplate = (templateId: string) => {
    dispatch({ type: 'USE_TEMPLATE', payload: templateId });
  };

  const activeTemplates = templateTab === 'scene' ? sceneTemplates : branchTemplates;

  const renderTemplateCard = (template: typeof templates[number]) => (
    <div key={template.id} className="w-full p-2 border border-[#e2e8f0] bg-[#f8fafc] text-xs font-medium rounded-sm hover:border-[#4f46e5] flex flex-col gap-2">
      <button
        onClick={() => useTemplate(template.id)}
        className="relative aspect-video overflow-hidden rounded-sm border border-[#e2e8f0] bg-white group"
        title={template.kind === 'branch' ? 'Apply Branch To Current Scene' : 'Use Template As New Scene'}
      >
        <img src={template.thumbnailDataUrl} alt={template.name} className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]" />
        <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/10 transition-colors" />
        <div className={`absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.18em] ${
          template.kind === 'branch'
            ? 'bg-indigo-600/90 text-white'
            : 'bg-white/90 text-slate-700'
        }`}>
          {template.kind === 'branch' ? 'Branch' : 'Scene'}
        </div>
      </button>

      {editingTemplateId === template.id ? (
        <div className="flex items-center gap-1 w-full">
          <input
            type="text"
            value={editingTemplateName}
            onChange={(e) => setEditingTemplateName(e.target.value)}
            className="flex-1 bg-white border border-[#e2e8f0] rounded-sm px-2 py-1 outline-none focus:border-[#4f46e5]"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                dispatch({ type: 'UPDATE_TEMPLATE', payload: { id: template.id, name: editingTemplateName } });
                setEditingTemplateId(null);
              } else if (e.key === 'Escape') {
                setEditingTemplateId(null);
              }
            }}
          />
          <button 
            onClick={() => {
              dispatch({ type: 'UPDATE_TEMPLATE', payload: { id: template.id, name: editingTemplateName } });
              setEditingTemplateId(null);
            }}
            className="p-1 text-emerald-500 hover:bg-emerald-50 rounded-sm"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={() => setEditingTemplateId(null)}
            className="p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-sm"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between w-full">
          <div className="min-w-0 mr-2">
            <span className="truncate block text-[#1e293b]" onDoubleClick={() => {
              setEditingTemplateId(template.id);
              setEditingTemplateName(template.name);
            }}>{template.name}</span>
            <span className="text-[10px] text-slate-400 font-medium">
              {template.kind === 'branch' ? 'Branch' : 'Scene'} • {template.scene.elements.length} items • {template.assets.length} assets
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={() => {
                setEditingTemplateId(template.id);
                setEditingTemplateName(template.name);
              }} className="p-1 text-slate-400 hover:text-blue-500" title="Edit Name">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => useTemplate(template.id)}
              className="p-1 text-slate-400 hover:text-[#4f46e5]"
              title={template.kind === 'branch' ? 'Apply Branch To Current Scene' : 'Use Template As New Scene'}
            >
              {template.kind === 'branch' ? <GitBranch className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => {
              if (confirm('Are you sure you want to delete this template?')) {
                dispatch({ type: 'DELETE_TEMPLATE', payload: template.id });
              }
            }} className="p-1 text-slate-400 hover:text-rose-500" title="Delete Template">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="w-72 bg-white border-r border-[#e2e8f0] flex flex-col h-full shrink-0">
      <div className="flex border-b border-[#f1f5f9]">
        <button
          className={`flex-1 py-2 text-[11px] font-bold border-b-2 transition-colors ${activeTab === 'library' ? 'text-[#1e293b] border-[#4f46e5] bg-white' : 'text-slate-400 border-transparent hover:bg-slate-50'}`}
          onClick={() => setActiveTab('library')}
        >
          Components
        </button>
        <button
          className={`flex-1 py-2 text-[11px] font-bold border-b-2 transition-colors ${activeTab === 'templates' ? 'text-[#1e293b] border-[#4f46e5] bg-white' : 'text-slate-400 border-transparent hover:bg-slate-50'}`}
          onClick={() => setActiveTab('templates')}
        >
          Templates
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'library' ? (
          <div className="p-4 space-y-6">
            <div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.2em]">Components</h3>
                  <p className="mt-1 text-[10px] font-medium text-slate-400">
                    Presets, searchable icons, and room for more component libraries later.
                  </p>
                </div>
                <div className="rounded-full bg-indigo-50 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-[#4f46e5]">
                  {LUCIDE_ICON_NAMES.length}
                </div>
              </div>

              <div className="mb-4 grid grid-cols-4 gap-2 rounded-sm bg-[#f8fafc] p-1">
                <button
                  type="button"
                  onClick={() => setComponentTab('favorites')}
                  className={`rounded-sm px-2 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                    componentTab === 'favorites'
                      ? 'bg-white text-[#1e293b] shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Favs
                </button>
                <button
                  type="button"
                  onClick={() => setComponentTab('presets')}
                  className={`rounded-sm px-2 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                    componentTab === 'presets'
                      ? 'bg-white text-[#1e293b] shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Presets
                </button>
                <button
                  type="button"
                  onClick={() => setComponentTab('icons')}
                  className={`rounded-sm px-2 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                    componentTab === 'icons'
                      ? 'bg-white text-[#1e293b] shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Icons
                </button>
                <button
                  type="button"
                  onClick={() => setComponentTab('assets')}
                  className={`rounded-sm px-2 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                    componentTab === 'assets'
                      ? 'bg-white text-[#1e293b] shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Assets
                </button>
              </div>

              {componentTab === 'favorites' ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-4 text-[10px] font-bold text-[#64748b] uppercase tracking-[0.2em]">Favorite Components</h3>
                    <p className="mt-1 text-[10px] font-medium text-slate-400">
                      Bookmark presets, icons, and assets for quick reuse.
                    </p>
                  </div>

                  {favoriteComponents.length === 0 ? (
                    <div className="rounded-sm border border-dashed border-[#dbe4f0] px-3 py-6 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      No favorites yet
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {favoritePresets.length > 0 && (
                        <div>
                          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Presets</div>
                          <div className="grid grid-cols-2 gap-2">
                            {favoritePresets.map((favorite) => {
                              const preset = presetDefinitionsById.get(favorite.id);
                              if (!preset) return null;

                              return (
                                <div key={favorite.id} className="relative">
                                  <FavoriteToggleButton
                                    active
                                    title={`Remove ${preset.label} from favorites`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      toggleFavorite({ type: 'preset', id: favorite.id });
                                    }}
                                    className="right-1.5 top-1.5"
                                  />
                                  <PresetButton label={preset.label} onClick={preset.onClick}>
                                    {preset.preview}
                                  </PresetButton>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {favoriteIcons.length > 0 && (
                        <div>
                          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Icons</div>
                          <div className="grid grid-cols-3 gap-2">
                            {favoriteIcons.map((favorite) => (
                              <div key={favorite.id} className="relative">
                                <FavoriteToggleButton
                                  active
                                  title="Remove icon from favorites"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleFavorite({ type: 'icon', id: favorite.id });
                                  }}
                                  className="right-1 top-1"
                                />
                                <button
                                  type="button"
                                  onClick={() => addIconElement(favorite.id)}
                                  className="flex items-center justify-center rounded-sm border border-[#e2e8f0] bg-[#f8fafc] px-1.5 py-2 text-center transition-colors hover:border-[#4f46e5] hover:bg-white"
                                >
                                  <IconPresetPreview iconName={favorite.id} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {favoriteAssets.length > 0 && (
                        <div>
                          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Assets</div>
                          <div className="grid grid-cols-2 gap-3">
                            {favoriteAssets.map((asset) => {
                              const usageCount = getAssetUsageCount(asset.id);

                              return (
                                <div key={asset.id} className="relative aspect-square group">
                                  <FavoriteToggleButton
                                    active
                                    title={`Remove ${asset.name} from favorites`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      toggleFavorite({ type: 'asset', id: asset.id });
                                    }}
                                    className="left-1.5 top-1.5"
                                  />
                                  <button
                                    onClick={() => addImageElement(asset.id)}
                                    className="h-full w-full bg-[#f1f5f9] border border-[#e2e8f0] hover:border-[#4f46e5] transition-colors cursor-pointer flex flex-col items-center justify-center overflow-hidden relative"
                                    title={asset.name}
                                  >
                                    <img src={asset.dataUrl} alt={asset.name} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                      <Plus className="w-6 h-6 text-white" />
                                    </div>
                                  </button>

                                  <button
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      deleteAsset(asset.id);
                                    }}
                                    className="absolute top-1.5 right-1.5 rounded-full bg-white/90 p-1 text-slate-500 opacity-0 shadow-sm transition-all hover:bg-white hover:text-rose-500 group-hover:opacity-100"
                                    title={usageCount > 0 ? `Delete Asset (${usageCount} uses)` : 'Delete Asset'}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>

                                  {usageCount > 0 && (
                                    <div className="absolute left-1.5 bottom-1.5 rounded-full bg-slate-900/70 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white">
                                      {usageCount} use{usageCount === 1 ? '' : 's'}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : componentTab === 'presets' ? (
                <div>
                  <div>
                    <h3 className="mb-4 text-[10px] font-bold text-[#64748b] uppercase tracking-[0.2em]">Component Presets</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {presetDefinitions.map((preset) => (
                        <div key={preset.id} className="relative">
                          <FavoriteToggleButton
                            active={isFavorite({ type: 'preset', id: preset.id })}
                            title={`${isFavorite({ type: 'preset', id: preset.id }) ? 'Remove' : 'Add'} ${preset.label} ${isFavorite({ type: 'preset', id: preset.id }) ? 'from' : 'to'} favorites`}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleFavorite({ type: 'preset', id: preset.id });
                            }}
                            className="right-1.5 top-1.5"
                          />
                          <PresetButton label={preset.label} onClick={preset.onClick}>
                            {preset.preview}
                          </PresetButton>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : componentTab === 'icons' ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.2em]">Icon Library</h3>
                    <p className="mt-1 text-[10px] font-medium text-slate-400">
                      Search Lucide icons and add them as resizable components.
                    </p>
                  </div>

                  <label className="flex items-center gap-2 rounded-sm border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 focus-within:border-[#4f46e5]">
                    <Search className="h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={iconQuery}
                      onChange={(event) => setIconQuery(event.target.value)}
                      placeholder="Search icons..."
                      className="w-full bg-transparent text-xs text-[#0f172a] outline-none placeholder:text-slate-400"
                    />
                  </label>

                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    <span>{deferredIconQuery.trim() ? 'Search Results' : 'Featured Icons'}</span>
                    <span className="text-[#4f46e5]">{filteredIcons.length}</span>
                  </div>

                  {filteredIcons.length === 0 ? (
                    <div className="rounded-sm border border-dashed border-[#dbe4f0] px-3 py-6 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      No icons match that search
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {filteredIcons.map((iconName) => (
                        <div key={iconName} className="relative">
                          <FavoriteToggleButton
                            active={isFavorite({ type: 'icon', id: iconName })}
                            title={`${isFavorite({ type: 'icon', id: iconName }) ? 'Remove' : 'Add'} icon ${isFavorite({ type: 'icon', id: iconName }) ? 'from' : 'to'} favorites`}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleFavorite({ type: 'icon', id: iconName });
                            }}
                            className="right-1 top-1"
                          />
                          <button
                            type="button"
                            onClick={() => addIconElement(iconName)}
                            className="flex items-center justify-center rounded-sm border border-[#e2e8f0] bg-[#f8fafc] px-1.5 py-2 text-center transition-colors hover:border-[#4f46e5] hover:bg-white"
                          >
                            <IconPresetPreview iconName={iconName} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.2em]">Assets Library</h3>
                      <p className="mt-1 text-[10px] font-medium text-slate-400">Upload images and add them as visual components.</p>
                    </div>
                    <label className="cursor-pointer text-slate-400 hover:text-[#4f46e5] transition-colors" title="Upload Images">
                      <Upload className="w-4 h-4" />
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                    </label>
                  </div>
                  
                  {project.assets.length === 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      <label className="aspect-square border border-dashed border-[#cbd5e1] hover:bg-slate-50 flex flex-col items-center justify-center text-[#64748b] transition-all cursor-pointer">
                        <Upload className="w-5 h-5 mb-1" />
                        <span className="text-[9px] font-bold uppercase tracking-wider">Upload</span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                      </label>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <label className="aspect-square border border-dashed border-[#cbd5e1] hover:bg-slate-50 flex flex-col items-center justify-center text-[#64748b] transition-all cursor-pointer">
                        <Upload className="w-5 h-5 mb-1" />
                        <span className="text-[9px] font-bold uppercase tracking-wider">Upload</span>
                        <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                      </label>
                      {project.assets.map((asset) => {
                        const usageCount = getAssetUsageCount(asset.id);

                        return (
                          <div key={asset.id} className="relative aspect-square group">
                            <FavoriteToggleButton
                              active={isFavorite({ type: 'asset', id: asset.id })}
                              title={`${isFavorite({ type: 'asset', id: asset.id }) ? 'Remove' : 'Add'} ${asset.name} ${isFavorite({ type: 'asset', id: asset.id }) ? 'from' : 'to'} favorites`}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleFavorite({ type: 'asset', id: asset.id });
                              }}
                              className="left-1.5 top-1.5"
                            />
                            <button
                              onClick={() => addImageElement(asset.id)}
                              className="h-full w-full bg-[#f1f5f9] border border-[#e2e8f0] hover:border-[#4f46e5] transition-colors cursor-pointer flex flex-col items-center justify-center overflow-hidden relative"
                              title={asset.name}
                            >
                              <img src={asset.dataUrl} alt={asset.name} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Plus className="w-6 h-6 text-white" />
                              </div>
                            </button>

                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                deleteAsset(asset.id);
                              }}
                              className="absolute top-1.5 right-1.5 rounded-full bg-white/90 p-1 text-slate-500 opacity-0 shadow-sm transition-all hover:bg-white hover:text-rose-500 group-hover:opacity-100"
                              title={usageCount > 0 ? `Delete Asset (${usageCount} uses)` : 'Delete Asset'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                            {usageCount > 0 && (
                              <div className="absolute left-1.5 bottom-1.5 rounded-full bg-slate-900/70 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white">
                                {usageCount} use{usageCount === 1 ? '' : 's'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-6">
            <div>
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.2em]">Template Library</h3>
                  <p className="mt-1 text-[10px] font-medium text-slate-400">Scene templates create scenes. Branches append sequences into the current scene.</p>
                </div>
                <div className="rounded-full bg-indigo-50 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-[#4f46e5]">
                  {templates.length}
                </div>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => saveCurrentAsTemplate('scene')}
                  className="w-full p-3 border border-[#e2e8f0] bg-[#f8fafc] text-xs font-medium rounded-sm cursor-pointer hover:border-[#4f46e5] transition-colors flex items-center justify-center gap-2 text-[#4f46e5]"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Template</span>
                </button>
                <button
                  onClick={() => saveCurrentAsTemplate('branch')}
                  className="w-full p-3 border border-[#c7d2fe] bg-indigo-50 text-xs font-medium rounded-sm cursor-pointer hover:border-[#4f46e5] transition-colors flex items-center justify-center gap-2 text-[#4f46e5]"
                >
                  <GitBranch className="w-4 h-4" />
                  <span>Save Branch</span>
                </button>
              </div>

              {templates.length === 0 ? (
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center py-4">No templates yet</p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 rounded-sm bg-[#f8fafc] p-1">
                    <button
                      type="button"
                      onClick={() => setTemplateTab('scene')}
                      className={`rounded-sm px-2 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                        templateTab === 'scene'
                          ? 'bg-white text-[#1e293b] shadow-sm'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        <span>Scenes</span>
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] text-slate-500">
                          {sceneTemplates.length}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateTab('branch')}
                      className={`rounded-sm px-2 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                        templateTab === 'branch'
                          ? 'bg-white text-[#4f46e5] shadow-sm'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        <span>Branches</span>
                        <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[8px] text-[#4f46e5]">
                          {branchTemplates.length}
                        </span>
                      </span>
                    </button>
                  </div>

                  {activeTemplates.length === 0 ? (
                    <p className={`rounded-sm border border-dashed px-3 py-3 text-[10px] font-bold uppercase tracking-wider ${
                      templateTab === 'scene'
                        ? 'border-[#dbe4f0] bg-white text-slate-300'
                        : 'border-[#c7d2fe] bg-indigo-50/40 text-indigo-300'
                    }`}>
                      {templateTab === 'scene' ? 'No scene templates yet' : 'No branch templates yet'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {activeTemplates.map(renderTemplateCard)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
