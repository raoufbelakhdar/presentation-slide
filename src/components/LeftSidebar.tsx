import React, { useState } from 'react';
import { useAppContext } from '../AppContext';
import { Type, Upload, Save, Copy, Plus, Trash2, Edit2, Check, X, GitBranch } from 'lucide-react';
import { buildSceneTemplate, generateId } from '../utils';
import { TextElement, ImageElement, ShapeElement } from '../types';

export function LeftSidebar() {
  const { state, dispatch } = useAppContext();
  const { project, activeSceneIndex, templates } = state;
  const sceneTemplates = templates.filter((template) => (template.kind || 'scene') === 'scene');
  const branchTemplates = templates.filter((template) => template.kind === 'branch');
  const [activeTab, setActiveTab] = useState<'library' | 'templates'>('library');
  const [templateTab, setTemplateTab] = useState<'scene' | 'branch'>('scene');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateName, setEditingTemplateName] = useState('');

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

  const addTextElement = () => {
    const newElement: TextElement = {
      id: generateId(),
      type: 'text',
      text: 'Main Title\nSubtitle text here',
      x: 100,
      y: 100,
      width: 400,
      height: 120,
      revealStep: 1,
      fontSize: 48,
      subtitleFontSize: 24,
      padding: 24,
      fontWeight: 'bold',
      color: '#ffffff',
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
      revealStep: 1,
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
      revealStep: 1,
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
      revealStep: 1,
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
      revealStep: 1,
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
      revealStep: 1,
    };
    dispatch({ type: 'ADD_ELEMENT', payload: newElement });
  };

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
    <div className="w-60 bg-white border-r border-[#e2e8f0] flex flex-col h-full shrink-0">
      <div className="flex border-b border-[#f1f5f9]">
        <button
          className={`flex-1 py-2 text-[11px] font-bold border-b-2 transition-colors ${activeTab === 'library' ? 'text-[#1e293b] border-[#4f46e5] bg-white' : 'text-slate-400 border-transparent hover:bg-slate-50'}`}
          onClick={() => setActiveTab('library')}
        >
          Images & Text
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
              <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.2em] mb-4">Component Presets</h3>
              <div className="space-y-2">
                <button
                  onClick={addTextElement}
                  className="w-full p-3 border border-[#e2e8f0] bg-[#f8fafc] text-xs font-medium rounded-sm cursor-pointer hover:border-[#4f46e5] transition-colors flex items-center justify-center gap-2"
                >
                  <Type className="w-4 h-4 text-slate-500" />
                  <span>Standard Text Block</span>
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={addYesElement}
                    className="flex-1 p-3 border border-[#e2e8f0] bg-[#f8fafc] text-xs font-medium rounded-sm cursor-pointer hover:border-[#4f46e5] transition-colors flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span>Yes Badge</span>
                  </button>
                  <button
                    onClick={addNoElement}
                    className="flex-1 p-3 border border-[#e2e8f0] bg-[#f8fafc] text-xs font-medium rounded-sm cursor-pointer hover:border-[#4f46e5] transition-colors flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4 text-rose-500" />
                    <span>No Badge</span>
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addCheckElement}
                    className="flex-1 p-3 border border-[#e2e8f0] bg-[#f8fafc] text-xs font-medium rounded-sm cursor-pointer hover:border-[#4f46e5] transition-colors flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4 text-sky-500" />
                    <span>Blue Check</span>
                  </button>
                  <button
                    onClick={addCrossElement}
                    className="flex-1 p-3 border border-[#e2e8f0] bg-[#f8fafc] text-xs font-medium rounded-sm cursor-pointer hover:border-[#4f46e5] transition-colors flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4 text-rose-500" />
                    <span>Red X</span>
                  </button>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.2em]">Assets Library</h3>
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
