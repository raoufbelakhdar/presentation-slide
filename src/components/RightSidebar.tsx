import React, { useDeferredValue, useEffect, useState } from 'react';
import { useAppContext } from '../AppContext';
import { BringToFront, Check, Copy, Eye, EyeOff, Image as ImageIcon, Layers, Move, RotateCcw, Save, Search, SendToBack, Star, Trash2, Type, Upload, X } from 'lucide-react';
import { Asset, ColorElement, DEFAULT_SEQUENCE_ANIMATION_TYPE, DEFAULT_SEQUENCE_DELAY, DEFAULT_SEQUENCE_DURATION, FavoriteComponent, SavedComponent, SceneElement, ShapeElement, TextElement } from '../types';
import { createAssetFromFile, getAssetKind, getDefaultImageFrameStyle } from '../assetUtils';
import { combineTextContent, generateId, getEffectiveElementState, getTextAlign, getTextVariant, mergeAssetLibraries, splitTextContent } from '../utils';
import { DEFAULT_ICON_COLOR, formatIconName } from '../iconLibrary';
import { getEmojiById, getEmojiLabel } from '../emojiLibrary';
import { LucideIconGlyph } from './LucideIconGlyph';
import { EmojiGlyph } from './EmojiGlyph';

const COMPONENT_THUMBNAIL_BACKGROUND_CLASS =
  'bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_52%,#334155_100%)]';
const RIGHT_SIDEBAR_CLASS = 'w-80 bg-white border-l border-[#e2e8f0] flex flex-col h-full shrink-0';
type RightSidebarTab = 'properties' | 'library' | 'layers';

function SidebarTabs({
  activeTab,
  onChange,
}: {
  activeTab: RightSidebarTab;
  onChange: (tab: RightSidebarTab) => void;
}) {
  const tabs: Array<{ id: RightSidebarTab; label: string }> = [
    { id: 'properties', label: 'Properties' },
    { id: 'library', label: 'Library' },
    { id: 'layers', label: 'Layers' },
  ];

  return (
    <div className="border-b border-[#f1f5f9] px-4 py-2">
      <div className="grid grid-cols-3 gap-1 rounded-md bg-[#f8fafc] p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`rounded-sm px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-[#4f46e5] shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SidebarTabEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-md border border-dashed border-[#dbe4f0] bg-[#fcfdff] px-4 text-center">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#64748b]">
          {title}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          {description}
        </p>
      </div>
    </div>
  );
}

function getElementName(element: SceneElement, assetsById: Map<string, Asset>) {
  if (element.type === 'text') {
    const textVariant = getTextVariant(element);
    const title = textVariant === 'free'
      ? element.text.split('\n').find((line) => line.trim())?.trim()
      : splitTextContent(element.text).title.trim();
    return title || (textVariant === 'free' ? 'Free Text' : 'Text Block');
  }

  if (element.type === 'image') {
    return element.captionText?.trim() || assetsById.get(element.assetId)?.name || 'Image';
  }

  if (element.type === 'color') {
    return element.captionText?.trim() || 'Color Card';
  }

  if (element.shapeType === 'emoji') {
    const emojiEntry = getEmojiById(element.emojiHexcode || '');
    return emojiEntry ? getEmojiLabel(emojiEntry) : element.emojiChar || 'Emoji';
  }

  if (element.shapeType === 'icon') {
    return formatIconName(element.iconName || 'Icon');
  }

  if (element.shapeType === 'yes') return 'Yes Badge';
  if (element.shapeType === 'no') return 'No Badge';
  if (element.shapeType === 'check') return 'Check Mark';
  return 'Cross Mark';
}

function getElementTypeLabel(element: SceneElement) {
  if (element.type === 'text') return getTextVariant(element) === 'free' ? 'Text' : 'Text Block';
  if (element.type === 'image') return 'Image';
  if (element.type === 'color') return 'Color';
  if (element.shapeType === 'emoji') return 'Emoji';
  if (element.shapeType === 'icon') return 'Icon';
  if (element.shapeType === 'yes') return 'Yes';
  if (element.shapeType === 'no') return 'No';
  if (element.shapeType === 'check') return 'Check';
  return 'Cross';
}

function matchesSearchQuery(
  query: string,
  ...values: Array<string | null | undefined>
) {
  if (!query) return true;

  return values.some((value) => value?.toLowerCase().includes(query));
}

function getSavedComponentSearchText(favorite: SavedComponent) {
  const searchParts = [favorite.name, getElementTypeLabel(favorite.element)];
  const { element } = favorite;

  if (element.type === 'text') {
    searchParts.push(element.text);
  }

  if (element.type === 'image') {
    searchParts.push(favorite.asset?.name);
  }

  if (element.type === 'color') {
    searchParts.push(element.captionText, element.fillColor);
  }

  if (element.type === 'shape') {
    if (element.shapeType === 'icon') {
      searchParts.push(element.iconName, formatIconName(element.iconName || ''));
    }

    if (element.shapeType === 'emoji') {
      const emojiEntry = getEmojiById(element.emojiHexcode || '');
      searchParts.push(
        element.emojiChar,
        element.emojiHexcode,
        emojiEntry ? getEmojiLabel(emojiEntry) : undefined,
      );
    }
  }

  return searchParts.filter(Boolean).join(' ').toLowerCase();
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

function getSavedFavoriteId(projectId: string, sceneId: string, elementId: string) {
  return `saved:${projectId}:${sceneId}:${elementId}`;
}

function upsertHiddenKeyframe(element: SceneElement, step: number, hidden: boolean) {
  const nextKeyframes = { ...(element.keyframes || {}) };
  nextKeyframes[step] = { ...(nextKeyframes[step] || {}), hidden };
  return nextKeyframes;
}

type SavedElementLibraryGroupId =
  | 'text-block'
  | 'text-free'
  | 'image-photo'
  | 'image-graphic'
  | 'color-card'
  | 'shape-icon'
  | 'shape-emoji'
  | 'shape-badge'
  | 'shape-mark';

function getSavedElementAssetKind(asset?: Asset | null) {
  return asset ? getAssetKind(asset) : 'photo';
}

function getSavedElementLibraryGroupId(element: SceneElement, asset?: Asset | null): SavedElementLibraryGroupId {
  if (element.type === 'text') {
    return getTextVariant(element) === 'free' ? 'text-free' : 'text-block';
  }

  if (element.type === 'image') {
    return getSavedElementAssetKind(asset) === 'graphic' ? 'image-graphic' : 'image-photo';
  }

  if (element.type === 'color') {
    return 'color-card';
  }

  if (element.shapeType === 'icon') return 'shape-icon';
  if (element.shapeType === 'emoji') return 'shape-emoji';
  if (element.shapeType === 'yes' || element.shapeType === 'no') return 'shape-badge';
  return 'shape-mark';
}

function getSavedElementLibraryGroupLabel(groupId: SavedElementLibraryGroupId) {
  switch (groupId) {
    case 'text-block':
      return 'Text Blocks';
    case 'text-free':
      return 'Free Text';
    case 'image-photo':
      return 'Photos';
    case 'image-graphic':
      return 'Graphics';
    case 'color-card':
      return 'Color Cards';
    case 'shape-icon':
      return 'Icons';
    case 'shape-emoji':
      return 'Emojis';
    case 'shape-badge':
      return 'Badges';
    default:
      return 'Marks';
  }
}

function getVisibleSavedElementLibraryGroups(element: SceneElement, asset?: Asset | null): SavedElementLibraryGroupId[] {
  if (element.type === 'text') {
    return getTextVariant(element) === 'free'
      ? ['text-free', 'text-block']
      : ['text-block', 'text-free'];
  }

  if (element.type === 'image') {
    return getSavedElementAssetKind(asset) === 'graphic'
      ? ['image-graphic', 'image-photo']
      : ['image-photo', 'image-graphic'];
  }

  if (element.type === 'color') {
    return ['color-card'];
  }

  if (element.shapeType === 'icon') {
    return ['shape-icon', 'shape-emoji', 'shape-badge', 'shape-mark'];
  }

  if (element.shapeType === 'emoji') {
    return ['shape-emoji', 'shape-icon', 'shape-badge', 'shape-mark'];
  }

  if (element.shapeType === 'yes' || element.shapeType === 'no') {
    return ['shape-badge', 'shape-mark', 'shape-icon', 'shape-emoji'];
  }

  return ['shape-mark', 'shape-badge', 'shape-icon', 'shape-emoji'];
}

function renderSavedElementLibraryGroupIcon(groupId: SavedElementLibraryGroupId) {
  if (groupId === 'text-block' || groupId === 'text-free') {
    return <Type className="h-3.5 w-3.5" />;
  }

  if (groupId === 'image-photo' || groupId === 'image-graphic') {
    return <ImageIcon className="h-3.5 w-3.5" />;
  }

  if (groupId === 'color-card') {
    return <div className="h-3.5 w-3.5 rounded-[4px] border border-white/50 bg-gradient-to-br from-amber-300 via-orange-400 to-rose-500" />;
  }

  if (groupId === 'shape-icon') {
    return (
      <LucideIconGlyph
        name="star"
        className="h-3.5 w-3.5"
        color="currentColor"
        strokeWidth={2.25}
      />
    );
  }

  if (groupId === 'shape-emoji') {
    return (
      <EmojiGlyph
        id="grinning-face"
        fallback="😀"
        className="h-3.5 w-3.5 text-sm"
      />
    );
  }

  if (groupId === 'shape-badge') {
    return (
      <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-current text-[6px] font-black text-white">
        Y
      </div>
    );
  }

  return <Check className="h-3.5 w-3.5" strokeWidth={3} />;
}

function SavedElementLibraryPreview({
  element,
  asset,
  name,
}: {
  element: SceneElement;
  asset?: Asset | null;
  name: string;
}) {
  if (element.type === 'text') {
    const textVariant = getTextVariant(element);
    const textAlign = getTextAlign(element);
    const textParts = splitTextContent(element.text);
    const title = textVariant === 'free'
      ? element.text.split('\n').find((line) => line.trim())?.trim() || 'Text'
      : textParts.title.trim() || 'Title';
    const subtitleLines = textVariant === 'block'
      ? textParts.subtitle.split('\n').filter(Boolean).slice(0, 2)
      : [];

    if (textVariant === 'block') {
      return (
        <div className="flex h-full w-full items-center justify-center rounded-[18px] bg-[#2563eb] px-3 text-white">
          <div className="w-full" style={{ textAlign }}>
            <div
              className="truncate font-bold leading-tight"
              style={{ fontSize: `${Math.min(12, Math.max(8, element.fontSize / 6))}px` }}
            >
              {title}
            </div>
            {subtitleLines.map((line, index) => (
              <div
                key={`${name}-${index}`}
                className="truncate opacity-90"
                style={{
                  fontSize: `${Math.min(
                    9,
                    Math.max(7, (element.subtitleFontSize || Math.max(16, Math.round(element.fontSize * 0.6))) / 5),
                  )}px`,
                }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div
        className="flex h-full w-full items-center justify-center whitespace-pre-wrap break-words px-2.5 text-center font-bold leading-tight text-slate-800"
        style={{
          textAlign,
          color: element.color,
          fontWeight: element.fontWeight,
          fontSize: `${Math.min(13, Math.max(8, element.fontSize / 5.5))}px`,
        }}
      >
        {title}
      </div>
    );
  }

  if (element.type === 'image') {
    return asset ? (
      <img
        src={asset.dataUrl}
        alt={name}
        className={`h-full w-full ${
          getAssetKind(asset) === 'graphic' ? 'object-contain p-2' : 'object-cover'
        }`}
      />
    ) : (
      <div className="flex h-full w-full items-center justify-center px-2 text-center text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
        Missing Asset
      </div>
    );
  }

  if (element.type === 'color') {
    return (
      <div className="flex h-full w-full items-center justify-center p-2.5">
        <div
          className="h-full w-full rounded-[10px] border border-slate-100 shadow-sm"
          style={{ backgroundColor: element.fillColor }}
        />
      </div>
    );
  }

  if (element.shapeType === 'emoji') {
    const emojiEntry = getEmojiById(element.emojiHexcode || '');
    return (
      <div className="flex h-full w-full items-center justify-center">
        <EmojiGlyph
          id={element.emojiHexcode || 'grinning-face'}
          fallback={emojiEntry?.emoji || element.emojiChar || '😀'}
          className="h-12 w-12 text-5xl"
        />
      </div>
    );
  }

  if (element.shapeType === 'icon') {
    return (
      <div className="flex h-full w-full items-center justify-center p-3.5">
        <LucideIconGlyph
          name={element.iconName || 'circle'}
          className="h-full w-full"
          color={element.iconColor || DEFAULT_ICON_COLOR}
          strokeWidth={element.iconStrokeWidth || 2.25}
        />
      </div>
    );
  }

  if (element.shapeType === 'yes' || element.shapeType === 'no') {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div
          className={`flex h-14 w-14 flex-col items-center justify-center rounded-full text-white shadow-sm ${
            element.shapeType === 'yes' ? 'bg-[#2563eb]' : 'bg-[#ef4444]'
          }`}
        >
          <span className="text-[6px] font-semibold uppercase tracking-[0.16em]">
            {element.shapeType === 'yes' ? 'YES' : 'NO'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center">
      {element.shapeType === 'check' ? (
        <Check className="h-12 w-12 text-sky-500" strokeWidth={3.25} />
      ) : (
        <X className="h-12 w-12 text-rose-500" strokeWidth={3.25} />
      )}
    </div>
  );
}

function LayersPanel({
  step,
  elements,
  assets,
  selectedElementIds,
  onSelectElement,
  onToggleVisibility,
}: {
  step?: number | null;
  elements: SceneElement[];
  assets: Asset[];
  selectedElementIds: string[];
  onSelectElement: (event: React.MouseEvent<HTMLButtonElement>, elementId: string) => void;
  onToggleVisibility?: (element: SceneElement, hidden: boolean) => void;
}) {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const sequenceStep = step ?? null;
  const managedElements = elements
    .filter((element) => (sequenceStep === null ? true : element.revealStep <= sequenceStep))
    .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));

  const renderElementRow = (element: SceneElement) => {
    const hidden = sequenceStep === null
      ? false
      : Boolean(getEffectiveElementState(element, sequenceStep).hidden);

    return (
    <div
      key={element.id}
      className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 ${
        selectedElementIds.includes(element.id)
          ? 'border-[#4f46e5] bg-indigo-50'
          : 'border-[#e2e8f0] bg-white'
      }`}
    >
      <button
        type="button"
        onClick={(event) => onSelectElement(event, element.id)}
        className="min-w-0 flex-1 text-left"
      >
        <div className="truncate text-[11px] font-semibold text-[#0f172a]">
          {getElementName(element, assetsById)}
        </div>
        <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
          {getElementTypeLabel(element)}
        </div>
        {sequenceStep === null ? (
          <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[#4f46e5]">
            Layer {(element.zIndex ?? 0).toString().padStart(2, '0')}
          </div>
        ) : (
          <div className={`mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] ${
            hidden ? 'text-rose-400' : 'text-emerald-500'
          }`}>
            {hidden ? 'Hidden' : 'Visible'}
          </div>
        )}
      </button>

      {sequenceStep !== null && onToggleVisibility && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleVisibility(element, !hidden);
          }}
          className={`rounded-sm border p-1 transition-colors ${
            hidden
              ? 'border-rose-200 text-rose-500 hover:bg-rose-50'
              : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
          }`}
          title={hidden ? 'Reveal in this sequence' : 'Hide in this sequence'}
        >
          {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
    );
  };

  return (
    <div className="rounded-md border border-[#e2e8f0] bg-[#fcfdff] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#64748b]">
          {sequenceStep === null ? 'Scene Layers' : 'Sequence Layers'}
        </div>
        {sequenceStep === null ? (
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#4f46e5]">
            {managedElements.length}
          </div>
        ) : (
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#4f46e5]">
            S{sequenceStep}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {managedElements.length > 0 ? managedElements.map((element) => renderElementRow(element)) : (
          <div className="rounded-sm border border-dashed border-[#e2e8f0] px-2 py-2 text-[10px] text-slate-400">
            No components available in this sequence
          </div>
        )}
      </div>
    </div>
  );
}

export function RightSidebar() {
  const { state, dispatch } = useAppContext();
  const { project, activeSceneIndex, favoriteComponents, selectedElementId, selectedElementIds, sharedSavedComponents } = state;
  const activeScene = project.scenes[activeSceneIndex];
  const availableAssets = mergeAssetLibraries(project.assets, state.sharedAssets);
  const projectAssetsById = new Map<string, Asset>(availableAssets.map((asset) => [asset.id, asset]));
  
  const selectedElement = activeScene?.elements.find(el => el.id === selectedElementId);
  const selectedSequenceStep = state.selectedSequenceStep;
  const [activeTab, setActiveTab] = useState<RightSidebarTab>(
    !selectedElement && selectedSequenceStep !== null ? 'layers' : 'properties',
  );
  const [libraryQuery, setLibraryQuery] = useState('');
  const isMultiSelecting = selectedElementIds.length > 1;
  const deferredLibraryQuery = useDeferredValue(libraryQuery);
  const normalizedLibraryQuery = deferredLibraryQuery.trim().toLowerCase();

  useEffect(() => {
    if (selectedElementId) {
      setActiveTab('properties');
      return;
    }

    if (selectedSequenceStep !== null) {
      setActiveTab('layers');
      return;
    }

    setActiveTab('properties');
  }, [selectedElementId, selectedSequenceStep]);

  const handleSelectElement = (event: React.MouseEvent<HTMLButtonElement>, elementId: string) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      dispatch({ type: 'TOGGLE_ELEMENT_SELECTION', payload: elementId });
      return;
    }

    dispatch({ type: 'SELECT_ELEMENT', payload: elementId });
  };
  const handleSequenceVisibilityToggle = (element: SceneElement, hidden: boolean) => {
    if (selectedSequenceStep === null) {
      return;
    }

    dispatch({
      type: 'UPDATE_ELEMENT',
      payload: {
        id: element.id,
        updates: {
          keyframes: upsertHiddenKeyframe(element, selectedSequenceStep, hidden),
        },
      },
    });
  };

  if (!selectedElement) {
    if (selectedSequenceStep) {
      const config = activeScene?.sequences?.find(s => s.step === selectedSequenceStep) || {
        step: selectedSequenceStep,
        animationType: DEFAULT_SEQUENCE_ANIMATION_TYPE,
        duration: DEFAULT_SEQUENCE_DURATION,
        delay: DEFAULT_SEQUENCE_DELAY,
      };

      return (
        <div className={`${RIGHT_SIDEBAR_CLASS} overflow-y-auto`}>
          <div className="p-4 border-b border-[#f1f5f9] flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.2em]">Sequence Properties</h3>
            {(activeScene?.sequenceCount || 1) > 1 && (
              <button
                onClick={() => dispatch({
                  type: 'DELETE_SEQUENCE',
                  payload: { sceneIndex: activeSceneIndex, sequenceStep: selectedSequenceStep },
                })}
                className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                title="Delete Sequence"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <SidebarTabs activeTab={activeTab} onChange={setActiveTab} />

          <div className="p-4 space-y-5">
            {activeTab === 'properties' && (
              <>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Sequence Step</label>
                  <input 
                    type="text" 
                    value={`Sequence ${selectedSequenceStep.toString().padStart(2, '0')}`}
                    disabled
                    className="w-full bg-[#f1f5f9] border border-[#e2e8f0] rounded-sm text-xs p-2 font-bold text-slate-500"
                  />
                </div>
                
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Animation Type</label>
                  <select 
                    value={config.animationType}
                    onChange={(e) => dispatch({ type: 'UPDATE_SEQUENCE_CONFIG', payload: { sceneIndex: activeSceneIndex, step: selectedSequenceStep, config: { animationType: e.target.value as any } } })}
                    className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-2 font-bold focus:outline-none focus:border-[#4f46e5]"
                  >
                    <option value="none">None</option>
                    <option value="fade">Fade</option>
                    <option value="slide-up">Slide Up</option>
                    <option value="slide-left">Slide Left</option>
                    <option value="scale">Scale</option>
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Duration (s)</label>
                    <input 
                      type="number" 
                      step="0.1"
                      min="0"
                      value={config.duration}
                      onChange={(e) => dispatch({ type: 'UPDATE_SEQUENCE_CONFIG', payload: { sceneIndex: activeSceneIndex, step: selectedSequenceStep, config: { duration: parseFloat(e.target.value) || 0 } } })}
                      className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-2 font-mono focus:outline-none focus:border-[#4f46e5]"
                    />
                  </div>
                  
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Delay (s)</label>
                    <input 
                      type="number" 
                      step="0.1"
                      min="0"
                      value={config.delay}
                      onChange={(e) => dispatch({ type: 'UPDATE_SEQUENCE_CONFIG', payload: { sceneIndex: activeSceneIndex, step: selectedSequenceStep, config: { delay: parseFloat(e.target.value) || 0 } } })}
                      className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-2 font-mono focus:outline-none focus:border-[#4f46e5]"
                    />
                  </div>
                </div>
              </>
            )}

            {activeTab === 'library' && (
              <SidebarTabEmptyState
                title="Library"
                description="Select a component to browse matching saved components and asset choices."
              />
            )}

            {activeTab === 'layers' && (
              <LayersPanel
                step={selectedSequenceStep}
                elements={activeScene?.elements || []}
                assets={availableAssets}
                selectedElementIds={selectedElementIds}
                onSelectElement={handleSelectElement}
                onToggleVisibility={handleSequenceVisibilityToggle}
              />
            )}
          </div>
        </div>
      );
    }

    return (
      <div className={`${RIGHT_SIDEBAR_CLASS} overflow-y-auto`}>
        <div className="p-4 border-b border-[#f1f5f9]">
          <div className="flex flex-col items-center justify-center text-center mt-2">
            <Layers className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.2em]">Scene Properties</p>
            <p className="text-[10px] font-medium text-slate-400 mt-2">Select an element to edit</p>
          </div>
        </div>
        <SidebarTabs activeTab={activeTab} onChange={setActiveTab} />

        <div className="p-4 space-y-5">
          {activeTab === 'properties' && activeScene && (
            <>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Scene Name</label>
                <input 
                  type="text" 
                  value={activeScene.name}
                  onChange={(e) => dispatch({ 
                    type: 'UPDATE_SCENE', 
                    payload: { index: activeSceneIndex, scene: { ...activeScene, name: e.target.value } } 
                  })}
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-2 font-bold focus:outline-none focus:border-[#4f46e5]"
                />
              </div>
              
              <div className="rounded-md border border-[#e2e8f0] bg-[#f8fafc] p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                  <span>Elements</span>
                  <span className="text-[#4f46e5] font-mono">{activeScene.elements.length} Active</span>
                </p>
              </div>
            </>
          )}

          {activeTab === 'library' && (
            <SidebarTabEmptyState
              title="Library"
              description="Select a component to access its saved library and swap in related assets."
            />
          )}

          {activeTab === 'layers' && activeScene && (
            <LayersPanel
              elements={activeScene.elements}
              assets={availableAssets}
              selectedElementIds={selectedElementIds}
              onSelectElement={handleSelectElement}
            />
          )}
        </div>
      </div>
    );
  }

  if (isMultiSelecting) {
    return (
      <div className={`${RIGHT_SIDEBAR_CLASS} overflow-y-auto`}>
        <div className="p-4 border-b border-[#f1f5f9] flex items-center justify-between">
          <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.2em]">Multiple Selected</h3>
          <button
            onClick={() => dispatch({ type: 'DELETE_ELEMENTS', payload: selectedElementIds })}
            className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
            title="Delete Selected Elements"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        <SidebarTabs activeTab={activeTab} onChange={setActiveTab} />

        <div className="p-4 space-y-4">
          {activeTab === 'properties' && (
            <>
              <div className="rounded-sm border border-[#e2e8f0] bg-[#f8fafc] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Selection
                </div>
                <div className="mt-2 text-sm font-semibold text-[#0f172a]">
                  {selectedElementIds.length} components selected
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  Ctrl, Cmd, or Shift click components on the canvas or in sequence layers to add or remove them from this selection.
                </p>
              </div>

              <button
                onClick={() => dispatch({ type: 'DUPLICATE_ELEMENTS', payload: selectedElementIds })}
                className="w-full py-1.5 text-[10px] font-bold border border-[#e2e8f0] bg-slate-50 uppercase text-slate-600 hover:bg-slate-100 hover:border-[#cbd5e1] transition-colors rounded-sm mt-2 flex items-center justify-center gap-2"
              >
                <Copy className="w-3 h-3" />
                Duplicate Selected
              </button>
            </>
          )}

          {activeTab === 'library' && (
            <SidebarTabEmptyState
              title="Library"
              description="Library actions are available when a single component is selected."
            />
          )}

          {activeTab === 'layers' && (
            <LayersPanel
              step={selectedSequenceStep}
              elements={activeScene?.elements || []}
              assets={availableAssets}
              selectedElementIds={selectedElementIds}
              onSelectElement={handleSelectElement}
              onToggleVisibility={selectedSequenceStep !== null ? handleSequenceVisibilityToggle : undefined}
            />
          )}
        </div>
      </div>
    );
  }

  const handleUpdate = (updates: any) => {
    dispatch({
      type: 'UPDATE_ELEMENT',
      payload: { id: selectedElement.id, updates },
    });
  };

  const imageElement = selectedElement.type === 'image' ? (selectedElement as import('../types').ImageElement) : null;
  const colorElement = selectedElement.type === 'color' ? (selectedElement as ColorElement) : null;
  const textElement = selectedElement.type === 'text' ? (selectedElement as import('../types').TextElement) : null;
  const shapeElement = selectedElement.type === 'shape' ? (selectedElement as ShapeElement) : null;
  const imageAsset = imageElement ? availableAssets.find((asset) => asset.id === imageElement.assetId) || null : null;
  const imageFrameStyle = imageElement ? (imageElement.frameStyle || getDefaultImageFrameStyle(imageAsset)) : null;
  const filteredAvailableAssets = imageElement
    ? availableAssets.filter((asset) =>
        matchesSearchQuery(
          normalizedLibraryQuery,
          asset.name,
          asset.id,
          getAssetKind(asset),
        ),
      )
    : availableAssets;
  const displayedElement =
    selectedSequenceStep !== null && selectedElement.revealStep <= selectedSequenceStep
      ? getEffectiveElementState(selectedElement, selectedSequenceStep)
      : selectedElement;
  const favoriteSavedElements = favoriteComponents.filter(
    (
      favorite,
    ): favorite is SavedComponent => favorite.type === 'saved-element',
  );
  const sharedSavedComponentIds = new Set(sharedSavedComponents.map((component) => component.id));
  const selectedElementFavoriteId = getSavedFavoriteId(project.id, activeScene.id, selectedElement.id);
  const isSelectedElementSaved = favoriteSavedElements.some(
    (favorite) => favorite.id === selectedElementFavoriteId,
  );
  const isSelectedElementShared = sharedSavedComponentIds.has(selectedElementFavoriteId);
  const selectedElementFavoriteName = getElementName(selectedElement, projectAssetsById);
  const selectedLibraryGroups = getVisibleSavedElementLibraryGroups(selectedElement, imageAsset);
  const combinedSavedComponentMap = new Map<string, SavedComponent>();
  favoriteSavedElements.forEach((component) => combinedSavedComponentMap.set(component.id, component));
  sharedSavedComponents.forEach((component) => combinedSavedComponentMap.set(component.id, component));
  const combinedSavedComponents = Array.from(combinedSavedComponentMap.values());
  const matchingSavedComponents = combinedSavedComponents.filter(
    (component) => component.element.type === selectedElement.type,
  );
  const filteredMatchingSavedComponents = matchingSavedComponents.filter((component) =>
    matchesSearchQuery(normalizedLibraryQuery, getSavedComponentSearchText(component)),
  );
  const favoriteSavedElementsByGroup = new Map<SavedElementLibraryGroupId, SavedComponent[]>([]);

  for (const favorite of filteredMatchingSavedComponents) {
    const favoriteGroupId = getSavedElementLibraryGroupId(favorite.element, favorite.asset);
    const groupFavorites = favoriteSavedElementsByGroup.get(favoriteGroupId) || [];
    groupFavorites.push(favorite);
    favoriteSavedElementsByGroup.set(favoriteGroupId, groupFavorites);
  }

  const visibleFavoriteSavedGroups = selectedLibraryGroups
    .map((groupId) => ({
      groupId,
      label: getSavedElementLibraryGroupLabel(groupId),
      favorites: favoriteSavedElementsByGroup.get(groupId) || [],
    }))
    .filter((group) => group.favorites.length > 0);
  const textParts = textElement ? splitTextContent(textElement.text) : null;
  const textVariant = textElement ? getTextVariant(textElement) : null;
  const textAlign = textElement ? getTextAlign(textElement) : null;
  const otherElements = activeScene.elements.filter((element) => element.id !== selectedElement.id);
  const maxOtherZIndex = otherElements.reduce((maxZIndex, element) => Math.max(maxZIndex, element.zIndex ?? 0), -1);
  const minOtherZIndex = otherElements.reduce((minZIndex, element) => Math.min(minZIndex, element.zIndex ?? 0), 0);
  const selectedElementHiddenInSequence =
    selectedSequenceStep !== null &&
    selectedElement.revealStep <= selectedSequenceStep &&
    Boolean(getEffectiveElementState(selectedElement, selectedSequenceStep).hidden);
  const selectedEmoji = shapeElement?.shapeType === 'emoji'
    ? getEmojiById(shapeElement.emojiHexcode || '')
    : null;
  const canResetToInitialFrame =
    selectedSequenceStep !== null &&
    selectedSequenceStep > selectedElement.revealStep &&
    (
      displayedElement.x !== selectedElement.x ||
      displayedElement.y !== selectedElement.y ||
      displayedElement.width !== selectedElement.width ||
      displayedElement.height !== selectedElement.height
    );
  const propertiesTitle =
    selectedElement.type === 'shape' && selectedElement.shapeType === 'emoji'
      ? 'Emoji Properties'
      : selectedElement.type === 'shape' && selectedElement.shapeType === 'icon'
        ? 'Icon Properties'
        : `${selectedElement.type} Properties`;
  const buildSelectedSavedComponent = (): SavedComponent => {
    return {
      type: 'saved-element',
      id: selectedElementFavoriteId,
      name: selectedElementFavoriteName,
      element: cloneFavoriteElement(selectedElement),
      asset:
        selectedElement.type === 'image'
          ? projectAssetsById.get(selectedElement.assetId)
          : undefined,
    };
  };
  const saveSelectedElementToFavorites = () => {
    const favorite = buildSelectedSavedComponent();

    dispatch({ type: 'UPSERT_FAVORITE_COMPONENT', payload: favorite });
    if (isSelectedElementShared) {
      dispatch({ type: 'UPSERT_SHARED_SAVED_COMPONENT', payload: favorite });
    }
  };
  const toggleSelectedElementSharing = () => {
    const favorite = buildSelectedSavedComponent();

    if (isSelectedElementShared) {
      dispatch({ type: 'DELETE_SHARED_SAVED_COMPONENT', payload: favorite.id });
      return;
    }

    dispatch({ type: 'UPSERT_SHARED_SAVED_COMPONENT', payload: favorite });
  };
  const toggleSavedComponentFavorite = (favorite: SavedComponent) => {
    dispatch({ type: 'TOGGLE_FAVORITE_COMPONENT', payload: favorite });
  };
  const toggleSharedSavedComponent = (favorite: SavedComponent) => {
    if (sharedSavedComponentIds.has(favorite.id)) {
      dispatch({ type: 'DELETE_SHARED_SAVED_COMPONENT', payload: favorite.id });
      return;
    }

    dispatch({ type: 'UPSERT_SHARED_SAVED_COMPONENT', payload: favorite });
  };
  const deleteSavedComponent = (favorite: SavedComponent) => {
    const message = sharedSavedComponentIds.has(favorite.id)
      ? `Delete "${favorite.name}" from saved components and the shared library?`
      : `Delete "${favorite.name}" from saved components?`;

    if (!window.confirm(message)) {
      return;
    }

    dispatch({ type: 'DELETE_SAVED_COMPONENT', payload: favorite.id });
  };
  const replaceSelectedElementWithFavorite = (
    favorite: SavedComponent,
  ) => {
    const nextElement = cloneFavoriteElement(favorite.element);

    if (nextElement.type === 'image') {
      let assetId = nextElement.assetId;
      const existingAsset = projectAssetsById.get(assetId);

      if (!existingAsset) {
        if (!favorite.asset) {
          window.alert(
            "This saved component is missing its image asset, so it can't replace the selected component right now.",
          );
          return;
        }

        assetId = generateId();
        dispatch({
          type: 'ADD_ASSET',
          payload: {
            ...favorite.asset,
            id: assetId,
          },
        });
      }

      dispatch({
        type: 'REPLACE_ELEMENT',
        payload: {
          id: selectedElement.id,
          element: {
            ...nextElement,
            assetId,
          },
        },
      });
      return;
    }

    dispatch({
      type: 'REPLACE_ELEMENT',
      payload: {
        id: selectedElement.id,
        element: nextElement,
      },
    });
  };

  const positionSection = (
    <div className="overflow-hidden rounded-md border border-[#e2e8f0] bg-[#f8fafc]">
      <div className="flex h-8 items-center gap-2 border-b border-[#e2e8f0] px-2.5">
        <Move className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Position
        </span>
        <div className="ml-auto flex items-center gap-1 font-mono text-[10px] text-[#4f46e5]">
          <span className="rounded bg-white px-1.5 py-0.5">X {Math.round(displayedElement.x)}</span>
          <span className="rounded bg-white px-1.5 py-0.5">Y {Math.round(displayedElement.y)}</span>
        </div>
      </div>

      <div className="flex h-9 items-center gap-1 px-2">
        <Layers className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Layer
        </span>
        <span className="ml-0.5 font-mono text-[9px] text-[#4f46e5]">
          {selectedElement.zIndex ?? 0}
        </span>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => handleUpdate({ zIndex: minOtherZIndex - 1 })}
            className="flex h-7 w-7 items-center justify-center rounded text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
            title="Send to back"
            aria-label="Send to back"
          >
            <SendToBack className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleUpdate({ zIndex: maxOtherZIndex + 1 })}
            className="flex h-7 w-7 items-center justify-center rounded text-slate-500 transition-colors hover:bg-white hover:text-[#4f46e5]"
            title="Bring to front"
            aria-label="Bring to front"
          >
            <BringToFront className="h-3.5 w-3.5" />
          </button>

          <div className="mx-1 h-4 w-px bg-[#e2e8f0]" />

          <button
            type="button"
            onClick={() => dispatch({ type: 'DUPLICATE_ELEMENT', payload: selectedElement.id })}
            className="flex h-7 w-7 items-center justify-center rounded text-slate-500 transition-colors hover:bg-white hover:text-[#4f46e5]"
            title="Duplicate component"
            aria-label="Duplicate component"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() =>
              handleUpdate({
                x: selectedElement.x,
                y: selectedElement.y,
                width: selectedElement.width,
                height: selectedElement.height,
              })
            }
            disabled={!canResetToInitialFrame}
            className="flex h-7 w-7 items-center justify-center rounded text-amber-600 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
            title={canResetToInitialFrame ? 'Reset to initial position' : 'Already at initial position'}
            aria-label="Reset to initial position"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  const revealTimingSection = (
    <div className="flex gap-4">
      <div className="flex-1">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Reveal On</label>
        <input
          type="number"
          min={1}
          value={selectedElement.revealStep}
          onChange={(e) => handleUpdate({ revealStep: Math.max(1, parseInt(e.target.value) || 1) })}
          className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-2 font-bold focus:outline-none focus:border-[#4f46e5]"
        />
      </div>
      <div className="flex-1">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Hide On</label>
        <input
          type="number"
          min={selectedElement.revealStep + 1}
          placeholder="Never"
          value={selectedElement.hideStep || ''}
          onChange={(e) => {
            const val = e.target.value;
            handleUpdate({ hideStep: val ? Math.max(selectedElement.revealStep + 1, parseInt(val) || 0) : null });
          }}
          className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-2 font-bold focus:outline-none focus:border-[#4f46e5]"
        />
      </div>
    </div>
  );

  const saveShareSection = (
    <div className="rounded-md border border-[#dbe4f0] bg-[linear-gradient(180deg,#f8fbff_0%,#f8fafc_100%)] p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="flex items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#dbe4f0] bg-white shadow-sm">
          <SavedElementLibraryPreview
            element={selectedElement}
            asset={imageAsset}
            name={selectedElementFavoriteName}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white">
                {renderSavedElementLibraryGroupIcon(
                  getSavedElementLibraryGroupId(selectedElement, imageAsset),
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-[#0f172a]">
                  {selectedElementFavoriteName}
                </div>
                <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  {getElementTypeLabel(selectedElement)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={saveSelectedElementToFavorites}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#c7d2fe] bg-white text-[#4f46e5] transition-colors hover:border-[#4f46e5] hover:bg-[#eef2ff]"
                title={isSelectedElementSaved ? 'Update saved component' : 'Save component'}
              >
                <Save className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={toggleSelectedElementSharing}
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  isSelectedElementShared
                    ? 'border-[#4f46e5] bg-[#4f46e5] text-white hover:bg-[#4338ca]'
                    : 'border-[#dbe4f0] bg-white text-slate-500 hover:border-[#4f46e5] hover:text-[#4f46e5]'
                }`}
                title={isSelectedElementShared ? 'Remove from shared library' : 'Add to shared library'}
              >
                <Layers className="h-4 w-4" />
              </button>
              {(isSelectedElementSaved || isSelectedElementShared) && (
                <button
                  type="button"
                  onClick={() => deleteSavedComponent(buildSelectedSavedComponent())}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dbe4f0] bg-white text-slate-500 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-500"
                  title="Delete saved component"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] ${
              isSelectedElementSaved
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-white text-slate-500'
            }`}>
              {isSelectedElementSaved ? 'Saved' : 'Not Saved'}
            </div>
            <div className="rounded-full bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
              {filteredMatchingSavedComponents.length} In Library
            </div>
            {isSelectedElementShared && (
              <div className="rounded-full bg-[#4f46e5]/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#4f46e5]">
                Shared
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const propertySections = (
    <>
      {positionSection}
      {revealTimingSection}
      {saveShareSection}

      {selectedElement.type === 'image' && imageElement && !selectedElementHiddenInSequence && (
        <>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Render Style</label>
            <select
              value={imageFrameStyle || 'polaroid'}
              onChange={(e) => handleUpdate({ frameStyle: e.target.value as import('../types').ImageFrameStyle })}
              className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-2 font-bold focus:outline-none focus:border-[#4f46e5]"
            >
              <option value="polaroid">Polaroid Frame</option>
              <option value="plain">Frameless Graphic</option>
            </select>
            {imageAsset && (
              <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Asset Type: {getAssetKind(imageAsset)}
              </div>
            )}
          </div>

          {imageFrameStyle === 'polaroid' ? (
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Bottom Caption</label>
              <input
                type="text"
                value={imageElement.captionText || ''}
                placeholder="Optional label under the image"
                onChange={(e) => handleUpdate({ captionText: e.target.value })}
                className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-3 leading-relaxed focus:outline-none focus:border-[#4f46e5]"
              />
            </div>
          ) : (
            <div className="rounded-sm border border-dashed border-[#dbe4f0] px-3 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Frameless graphics render directly on the canvas without the white image card.
            </div>
          )}
        </>
      )}

      {selectedElement.type === 'color' && colorElement && !selectedElementHiddenInSequence && (
        <>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Bottom Caption</label>
            <input
              type="text"
              value={colorElement.captionText || ''}
              placeholder="Optional label under the color card"
              onChange={(e) => handleUpdate({ captionText: e.target.value })}
              className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-3 leading-relaxed focus:outline-none focus:border-[#4f46e5]"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Fill Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={colorElement.fillColor}
                onChange={(e) => handleUpdate({ fillColor: e.target.value })}
                className="h-8 w-8 rounded-sm cursor-pointer border-0 p-0 shrink-0"
              />
              <input
                type="text"
                value={colorElement.fillColor}
                onChange={(e) => handleUpdate({ fillColor: e.target.value })}
                className="flex-1 bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-2 font-mono uppercase focus:outline-none focus:border-[#4f46e5]"
              />
            </div>
          </div>
        </>
      )}

      {selectedElement.type === 'text' && textElement && (
        <>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Text Style</label>
            <select
              value={textVariant || 'block'}
              onChange={(e) => handleUpdate({ variant: e.target.value as TextElement['variant'] })}
              className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-2 font-bold focus:outline-none focus:border-[#4f46e5]"
            >
              <option value="free">Free Text</option>
              <option value="block">Text Block</option>
            </select>
          </div>

          {textVariant === 'free' ? (
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Text</label>
              <textarea 
                value={textElement.text} 
                onChange={(e) => handleUpdate({ text: e.target.value })}
                className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-3 min-h-[120px] leading-relaxed resize-none focus:outline-none focus:border-[#4f46e5]"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Title</label>
                <input
                  type="text"
                  value={textParts?.title || ''}
                  onChange={(e) => handleUpdate({ text: combineTextContent(e.target.value, textParts?.subtitle || '') })}
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-3 leading-relaxed focus:outline-none focus:border-[#4f46e5]"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Subtitle</label>
                <textarea 
                  value={textParts?.subtitle || ''} 
                  onChange={(e) => handleUpdate({ text: combineTextContent(textParts?.title || '', e.target.value) })}
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-3 min-h-[84px] leading-relaxed resize-none focus:outline-none focus:border-[#4f46e5]"
                />
              </div>
            </>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">{textVariant === 'free' ? 'Text Size' : 'Title Size'}</label>
              <input 
                type="number" 
                min={8} 
                value={textElement.fontSize} 
                onChange={(e) => handleUpdate({ fontSize: Math.max(8, parseInt(e.target.value) || 16) })}
                className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-2 font-mono focus:outline-none focus:border-[#4f46e5]"
              />
            </div>
            
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Weight</label>
              <select 
                value={textElement.fontWeight} 
                onChange={(e) => handleUpdate({ fontWeight: e.target.value })}
                className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-2 font-bold focus:outline-none focus:border-[#4f46e5]"
              >
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
                <option value="lighter">Lighter</option>
                <option value="bolder">Bolder</option>
                </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Alignment</label>
            <select
              value={textAlign || 'center'}
              onChange={(e) => handleUpdate({ align: e.target.value as TextElement['align'] })}
              className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-2 font-bold focus:outline-none focus:border-[#4f46e5]"
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>

          {textVariant === 'block' && (
            <>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Subtitle Size</label>
                <input 
                  type="number" 
                  min={8}
                  value={textElement.subtitleFontSize || Math.max(16, Math.round(textElement.fontSize * 0.6))}
                  onChange={(e) => handleUpdate({ subtitleFontSize: Math.max(8, parseInt(e.target.value) || 16) })}
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-2 font-mono focus:outline-none focus:border-[#4f46e5]"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Padding</label>
                <input 
                  type="number" 
                  min={8}
                  value={textElement.padding || 20}
                  onChange={(e) => handleUpdate({ padding: Math.max(6, parseInt(e.target.value) || 20) })}
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-2 font-mono focus:outline-none focus:border-[#4f46e5]"
                />
              </div>
            </>
          )}

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Color</label>
            <div className="flex items-center gap-2">
              <input 
                type="color" 
                value={textElement.color} 
                onChange={(e) => handleUpdate({ color: e.target.value })}
                className="h-8 w-8 rounded-sm cursor-pointer border-0 p-0 shrink-0"
              />
              <input 
                type="text" 
                value={textElement.color}
                onChange={(e) => handleUpdate({ color: e.target.value })}
                className="flex-1 bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-2 font-mono uppercase focus:outline-none focus:border-[#4f46e5]"
              />
            </div>
          </div>
        </>
      )}

      {selectedElement.type === 'shape' && shapeElement?.shapeType === 'emoji' && !selectedElementHiddenInSequence && (
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Emoji</label>
          <div className="rounded-sm border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2">
            <div className="text-xs font-semibold text-[#0f172a]">
              {selectedEmoji ? getEmojiLabel(selectedEmoji) : shapeElement.emojiChar || 'Emoji'}
            </div>
            <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">
              {selectedEmoji?.id || shapeElement.emojiHexcode || 'emoji'}
            </div>
          </div>
        </div>
      )}

      {selectedElement.type === 'shape' && shapeElement?.shapeType === 'icon' && !selectedElementHiddenInSequence && (
        <>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Icon</label>
            <div className="rounded-sm border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2">
              <div className="text-xs font-semibold text-[#0f172a]">{formatIconName(shapeElement.iconName || 'Icon')}</div>
              <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">
                {shapeElement.iconName || 'icon'}
              </div>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Stroke Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={shapeElement.iconColor || DEFAULT_ICON_COLOR}
                onChange={(e) => handleUpdate({ iconColor: e.target.value })}
                className="h-8 w-8 rounded-sm cursor-pointer border-0 p-0 shrink-0"
              />
              <input
                type="text"
                value={shapeElement.iconColor || DEFAULT_ICON_COLOR}
                onChange={(e) => handleUpdate({ iconColor: e.target.value })}
                className="flex-1 bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-2 font-mono uppercase focus:outline-none focus:border-[#4f46e5]"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Stroke Width</label>
            <input
              type="number"
              min={0.5}
              step={0.1}
              value={shapeElement.iconStrokeWidth || 2.25}
              onChange={(e) => handleUpdate({ iconStrokeWidth: Math.max(0.5, parseFloat(e.target.value) || 0.5) })}
              className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-2 font-mono focus:outline-none focus:border-[#4f46e5]"
            />
          </div>
        </>
      )}
    </>
  );

  const librarySections = (
    <>
      <label className="flex items-center gap-2 rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 focus-within:border-[#4f46e5]">
        <Search className="h-3.5 w-3.5 text-slate-400" />
        <input
          type="text"
          value={libraryQuery}
          onChange={(event) => setLibraryQuery(event.target.value)}
          placeholder="Search library..."
          className="w-full bg-transparent text-xs text-[#0f172a] outline-none placeholder:text-slate-400"
        />
      </label>

      <div className="rounded-md border border-[#e2e8f0] bg-[#f8fafc] p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Component Library
          </div>
          <div className="rounded-full bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
            {filteredMatchingSavedComponents.length}
          </div>
        </div>

        {visibleFavoriteSavedGroups.length === 0 ? (
          <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-[#dbe4f0] bg-white/70 px-4">
            <div className="flex flex-col items-center gap-2 text-center text-slate-400">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                {renderSavedElementLibraryGroupIcon(
                  getSavedElementLibraryGroupId(selectedElement, imageAsset),
                )}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em]">
                {normalizedLibraryQuery ? 'No library matches' : `No saved ${selectedElement.type}`}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleFavoriteSavedGroups.map((group) => (
              <div key={group.groupId}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm">
                      {renderSavedElementLibraryGroupIcon(group.groupId)}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                      {group.label}
                    </div>
                  </div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    {group.favorites.length}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {group.favorites.map((favorite) => {
                    const isCurrentFavorite = favorite.id === selectedElementFavoriteId;
                    const isSharedSavedComponent = sharedSavedComponentIds.has(favorite.id);
                    const isSavedFavorite = favoriteSavedElements.some((entry) => entry.id === favorite.id);

                    return (
                      <div
                        key={favorite.id}
                        className={`group rounded-xl border p-1.5 text-left transition-all ${
                          isCurrentFavorite
                            ? 'border-[#a5b4fc] bg-indigo-50 shadow-[0_6px_18px_rgba(79,70,229,0.08)]'
                            : 'border-[#dbe4f0] bg-white hover:border-[#4f46e5] hover:shadow-[0_6px_18px_rgba(15,23,42,0.06)]'
                        }`}
                      >
                        <div
                          className={`relative overflow-hidden rounded-[10px] border border-[#e2e8f0] ${COMPONENT_THUMBNAIL_BACKGROUND_CLASS}`}
                        >
                          <div className="pointer-events-none absolute inset-0 bg-slate-950/0 transition-colors duration-150 group-hover:bg-slate-950/10 group-focus-within:bg-slate-950/10" />
                          <div className="absolute right-1.5 top-1.5 z-10 flex translate-y-1 gap-1 opacity-0 transition-all duration-150 pointer-events-none group-hover:translate-y-0 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleSavedComponentFavorite(favorite);
                              }}
                              className={`rounded-full border p-1 shadow-sm backdrop-blur transition-colors ${
                                isSavedFavorite
                                  ? 'border-amber-300 bg-amber-50 text-amber-500'
                                  : 'border-white/70 bg-white/90 text-slate-400 hover:text-amber-500'
                              }`}
                              title={`${isSavedFavorite ? 'Remove from' : 'Add to'} favorites`}
                            >
                              <Star className={`h-3.5 w-3.5 ${isSavedFavorite ? 'fill-current' : ''}`} />
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleSharedSavedComponent(favorite);
                              }}
                              className={`rounded-full border p-1 shadow-sm backdrop-blur transition-colors ${
                                isSharedSavedComponent
                                  ? 'border-[#4f46e5] bg-[#4f46e5] text-white hover:bg-[#4338ca]'
                                  : 'border-white/70 bg-white/90 text-slate-400 hover:text-[#4f46e5]'
                              }`}
                              title={isSharedSavedComponent ? 'Remove from shared library' : 'Add to shared library'}
                            >
                              <Layers className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                deleteSavedComponent(favorite);
                              }}
                              className="rounded-full border border-white/70 bg-white/90 p-1 text-slate-400 shadow-sm backdrop-blur transition-colors hover:text-rose-500"
                              title="Delete saved component"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="pointer-events-none absolute left-1.5 top-1.5 z-10 flex h-6 w-6 translate-y-1 items-center justify-center rounded-full bg-white/95 text-slate-700 opacity-0 shadow-sm transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
                            {renderSavedElementLibraryGroupIcon(group.groupId)}
                          </div>
                          <button
                            type="button"
                            onClick={() => replaceSelectedElementWithFavorite(favorite)}
                            title={favorite.name}
                            className="block aspect-[1.08/1] w-full"
                          >
                            <SavedElementLibraryPreview
                              element={favorite.element}
                              asset={favorite.asset}
                              name={favorite.name}
                            />
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1 truncate text-[10px] font-semibold text-[#0f172a]">
                            {favorite.name}
                          </div>
                          <div className="flex items-center gap-1">
                            {isCurrentFavorite && (
                              <div className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-[#4f46e5]">
                                Current
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedElement.type === 'image' && imageElement && !selectedElementHiddenInSequence && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Asset Source</label>
            {imageAsset && (
              <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                {filteredAvailableAssets.length}
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {filteredAvailableAssets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => handleUpdate({ assetId: asset.id, frameStyle: getDefaultImageFrameStyle(asset) })}
                className={`aspect-square overflow-hidden rounded-lg border transition-all ${
                  imageElement.assetId === asset.id
                    ? 'border-[#4f46e5] bg-indigo-50'
                    : 'border-[#dbe4f0] bg-white hover:border-slate-300'
                }`}
                title={asset.name}
              >
                <img src={asset.dataUrl} alt={asset.name} className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
          {filteredAvailableAssets.length === 0 && (
            <div className="mt-2 rounded-lg border border-dashed border-[#dbe4f0] bg-white px-3 py-4 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              No assets match that search
            </div>
          )}
          <label className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#e2e8f0] bg-slate-50 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600 transition-colors hover:border-[#cbd5e1] hover:bg-slate-100">
            <Upload className="h-3.5 w-3.5" />
            Upload
            <input
              type="file"
              accept="image/*,.svg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void (async () => {
                    const asset = await createAssetFromFile(file);
                    dispatch({
                      type: 'ADD_ASSET',
                      payload: asset,
                    });
                    handleUpdate({
                      assetId: asset.id,
                      frameStyle: getDefaultImageFrameStyle(asset),
                    });
                  })();
                }
              }}
            />
          </label>
        </div>
      )}
    </>
  );

  const layerSections = (
    <>
      <LayersPanel
        step={selectedSequenceStep}
        elements={activeScene.elements}
        assets={availableAssets}
        selectedElementIds={selectedElementIds}
        onSelectElement={handleSelectElement}
        onToggleVisibility={selectedSequenceStep !== null ? handleSequenceVisibilityToggle : undefined}
      />
    </>
  );

  return (
    <div className={`${RIGHT_SIDEBAR_CLASS} overflow-y-auto`}>
      <div className="p-4 border-b border-[#f1f5f9] flex items-center justify-between">
        <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.2em]">{propertiesTitle}</h3>
        <button 
          onClick={() => dispatch({ type: 'DELETE_ELEMENT', payload: selectedElement.id })}
          className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
          title="Delete Element"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <SidebarTabs activeTab={activeTab} onChange={setActiveTab} />

      <div className="p-4 space-y-5">
        {activeTab === 'properties' && propertySections}
        {activeTab === 'library' && librarySections}
        {activeTab === 'layers' && layerSections}
      </div>
    </div>
  );
}
