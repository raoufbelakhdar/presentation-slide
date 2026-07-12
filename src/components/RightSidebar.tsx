import React from 'react';
import { useAppContext } from '../AppContext';
import { Copy, Trash2, Layers, Eye, EyeOff } from 'lucide-react';
import { Asset, DEFAULT_SEQUENCE_ANIMATION_TYPE, DEFAULT_SEQUENCE_DELAY, DEFAULT_SEQUENCE_DURATION, SceneElement, TextElement } from '../types';
import { combineTextContent, getEffectiveElementState, splitTextContent } from '../utils';

function getElementName(element: SceneElement, assetsById: Map<string, Asset>) {
  if (element.type === 'text') {
    const title = splitTextContent(element.text).title.trim();
    return title || 'Text';
  }

  if (element.type === 'image') {
    return element.captionText?.trim() || assetsById.get(element.assetId)?.name || 'Image';
  }

  if (element.shapeType === 'yes') return 'Yes Badge';
  if (element.shapeType === 'no') return 'No Badge';
  if (element.shapeType === 'check') return 'Check Mark';
  return 'Cross Mark';
}

function getElementTypeLabel(element: SceneElement) {
  if (element.type === 'text') return 'Text';
  if (element.type === 'image') return 'Image';
  if (element.shapeType === 'yes') return 'Yes';
  if (element.shapeType === 'no') return 'No';
  if (element.shapeType === 'check') return 'Check';
  return 'Cross';
}

function upsertHiddenKeyframe(element: SceneElement, step: number, hidden: boolean) {
  const nextKeyframes = { ...(element.keyframes || {}) };
  nextKeyframes[step] = { ...(nextKeyframes[step] || {}), hidden };
  return nextKeyframes;
}

function SequenceLayersPanel({
  step,
  elements,
  assets,
  selectedElementId,
  onSelectElement,
  onToggleVisibility,
}: {
  step: number;
  elements: SceneElement[];
  assets: Asset[];
  selectedElementId: string | null;
  onSelectElement: (elementId: string) => void;
  onToggleVisibility: (element: SceneElement, hidden: boolean) => void;
}) {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const managedElements = elements
    .filter((element) => element.revealStep <= step)
    .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));
  const visibleElements = managedElements.filter((element) => !getEffectiveElementState(element, step).hidden);
  const hiddenElements = managedElements.filter((element) => getEffectiveElementState(element, step).hidden);

  const renderElementRow = (element: SceneElement, hidden: boolean) => (
    <div
      key={element.id}
      className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 ${
        selectedElementId === element.id
          ? 'border-[#4f46e5] bg-indigo-50'
          : 'border-[#e2e8f0] bg-white'
      }`}
    >
      <button
        type="button"
        onClick={() => onSelectElement(element.id)}
        className="min-w-0 flex-1 text-left"
      >
        <div className="truncate text-[11px] font-semibold text-[#0f172a]">
          {getElementName(element, assetsById)}
        </div>
        <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
          {getElementTypeLabel(element)}
        </div>
      </button>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleVisibility(element, !hidden);
        }}
        className={`rounded-sm border p-1 transition-colors ${
          hidden
            ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
            : 'border-rose-200 text-rose-500 hover:bg-rose-50'
        }`}
        title={hidden ? 'Reveal in this sequence' : 'Hide in this sequence'}
      >
        {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
    </div>
  );

  return (
    <div className="border-b border-[#f1f5f9] bg-[#fcfdff] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#64748b]">
          Sequence Layers
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#4f46e5]">
          S{step}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            <span>Visible</span>
            <span>{visibleElements.length}</span>
          </div>
          <div className="space-y-2">
            {visibleElements.length > 0 ? visibleElements.map((element) => renderElementRow(element, false)) : (
              <div className="rounded-sm border border-dashed border-[#e2e8f0] px-2 py-2 text-[10px] text-slate-400">
                No visible components
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            <span>Hidden</span>
            <span>{hiddenElements.length}</span>
          </div>
          <div className="space-y-2">
            {hiddenElements.length > 0 ? hiddenElements.map((element) => renderElementRow(element, true)) : (
              <div className="rounded-sm border border-dashed border-[#e2e8f0] px-2 py-2 text-[10px] text-slate-400">
                No hidden components
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function RightSidebar() {
  const { state, dispatch } = useAppContext();
  const { project, activeSceneIndex, selectedElementId } = state;
  const activeScene = project.scenes[activeSceneIndex];
  
  const selectedElement = activeScene?.elements.find(el => el.id === selectedElementId);
  const selectedSequenceStep = state.selectedSequenceStep;
  const handleSelectElement = (elementId: string) => {
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
        <div className="w-64 bg-white border-l border-[#e2e8f0] flex flex-col h-full shrink-0 overflow-y-auto">
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
          
          <div className="p-4 space-y-5">
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
          </div>

          <SequenceLayersPanel
            step={selectedSequenceStep}
            elements={activeScene?.elements || []}
            assets={project.assets}
            selectedElementId={selectedElementId}
            onSelectElement={handleSelectElement}
            onToggleVisibility={handleSequenceVisibilityToggle}
          />
        </div>
      );
    }

    return (
      <div className="w-64 bg-white border-l border-[#e2e8f0] flex flex-col h-full shrink-0 p-4 space-y-6">
        <div className="flex flex-col items-center justify-center text-center mt-6 mb-4">
          <Layers className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.2em]">Scene Properties</p>
          <p className="text-[10px] font-medium text-slate-400 mt-2">Select an element to edit</p>
        </div>
        
        {activeScene && (
          <div className="space-y-4">
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
            
            <div className="pt-4 border-t border-[#f1f5f9] space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                <span>Elements</span>
                <span className="text-[#4f46e5] font-mono">{activeScene.elements.length} Active</span>
              </p>
            </div>
          </div>
        )}
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
  const textElement = selectedElement.type === 'text' ? (selectedElement as import('../types').TextElement) : null;
  const textParts = textElement ? splitTextContent(textElement.text) : null;
  const otherElements = activeScene.elements.filter((element) => element.id !== selectedElement.id);
  const maxOtherZIndex = otherElements.reduce((maxZIndex, element) => Math.max(maxZIndex, element.zIndex ?? 0), -1);
  const minOtherZIndex = otherElements.reduce((minZIndex, element) => Math.min(minZIndex, element.zIndex ?? 0), 0);

  return (
    <div className="w-64 bg-white border-l border-[#e2e8f0] flex flex-col h-full shrink-0 overflow-y-auto">
      <div className="p-4 border-b border-[#f1f5f9] flex items-center justify-between">
        <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.2em]">{selectedElement.type} Properties</h3>
        <button 
          onClick={() => dispatch({ type: 'DELETE_ELEMENT', payload: selectedElement.id })}
          className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
          title="Delete Element"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-5">
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

        {selectedElement.type === 'image' && imageElement && (
          <>
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

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Replace Image</label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {project.assets.map(asset => (
                  <div 
                    key={asset.id} 
                    onClick={() => handleUpdate({ assetId: asset.id })}
                    className={`aspect-square bg-slate-100 rounded-sm overflow-hidden cursor-pointer border-2 transition-all ${imageElement.assetId === asset.id ? 'border-[#4f46e5]' : 'border-transparent hover:border-slate-300'}`}
                  >
                    <img src={asset.dataUrl} alt={asset.name} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
              <label className="w-full py-1.5 mt-2 text-[10px] font-bold border border-[#e2e8f0] bg-slate-50 uppercase text-slate-600 hover:bg-slate-100 hover:border-[#cbd5e1] transition-colors rounded-sm flex items-center justify-center cursor-pointer">
                Upload New
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (e) => {
                        const dataUrl = e.target?.result as string;
                        const newAssetId = Math.random().toString(36).substring(2, 9);
                        dispatch({
                          type: 'ADD_ASSET',
                          payload: { id: newAssetId, name: file.name, dataUrl }
                        });
                        handleUpdate({ assetId: newAssetId });
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </label>
            </div>
          </>
        )}

        {selectedElement.type === 'text' && textElement && (
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
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Title Size</label>
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
                value={textElement.padding || 24}
                onChange={(e) => handleUpdate({ padding: Math.max(8, parseInt(e.target.value) || 24) })}
                className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-sm text-xs p-2 font-mono focus:outline-none focus:border-[#4f46e5]"
              />
            </div>

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

        <div className="pt-4 border-t border-[#f1f5f9]">
          <div className="flex items-center justify-between mb-2">
             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Position</span>
             <span className="text-[10px] font-mono text-[#4f46e5]">X: {Math.round(selectedElement.x)} | Y: {Math.round(selectedElement.y)}</span>
          </div>
          <div className="mb-3 rounded-sm border border-[#e2e8f0] bg-[#f8fafc] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Layer Order</span>
              <span className="text-[10px] font-mono text-[#4f46e5]">Z: {selectedElement.zIndex ?? 0}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleUpdate({ zIndex: minOtherZIndex - 1 })}
                className="rounded-sm border border-[#e2e8f0] bg-white px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 transition-colors hover:border-[#cbd5e1] hover:bg-slate-50"
              >
                Send Back
              </button>
              <button
                onClick={() => handleUpdate({ zIndex: maxOtherZIndex + 1 })}
                className="rounded-sm border border-[#c7d2fe] bg-indigo-50 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#4f46e5] transition-colors hover:border-[#4f46e5] hover:bg-indigo-100"
              >
                Bring Front
              </button>
            </div>
          </div>
          <button 
            onClick={() => dispatch({ type: 'DUPLICATE_ELEMENT', payload: selectedElement.id })}
            className="w-full py-1.5 text-[10px] font-bold border border-[#e2e8f0] bg-slate-50 uppercase text-slate-600 hover:bg-slate-100 hover:border-[#cbd5e1] transition-colors rounded-sm mt-2 flex items-center justify-center gap-2"
          >
            <Copy className="w-3 h-3" />
            Duplicate
          </button>
        </div>
      </div>

      {selectedSequenceStep !== null && (
        <SequenceLayersPanel
          step={selectedSequenceStep}
          elements={activeScene.elements}
          assets={project.assets}
          selectedElementId={selectedElementId}
          onSelectElement={handleSelectElement}
          onToggleVisibility={handleSequenceVisibilityToggle}
        />
      )}
    </div>
  );
}
