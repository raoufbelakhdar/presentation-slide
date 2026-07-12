import React from 'react';
import { useAppContext } from '../AppContext';
import { Play, Save, FolderOpen, Plus, Copy, Trash2, Download, Undo2, Redo2, Home } from 'lucide-react';
import { generateId, exportProject, readTextFile } from '../utils';

export function Toolbar() {
  const { state, dispatch, canUndo, canRedo } = useAppContext();
  const { project, activeSceneIndex, mode } = state;

  const handleNewScene = () => {
    dispatch({
      type: 'ADD_SCENE',
      payload: {
        id: generateId(),
        name: `Scene ${project.scenes.length + 1}`,
        elements: [],
      },
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const text = await readTextFile(file);
        const importedProject = JSON.parse(text);
        if (importedProject && importedProject.scenes) {
          dispatch({ type: 'LOAD_PROJECT', payload: importedProject });
        }
      } catch (error) {
        console.error("Failed to parse project file", error);
        alert("Invalid project file");
      }
    }
  };

  if (mode === 'presentation') {
    return null; // Don't show standard toolbar in presentation mode
  }

  return (
    <div className="flex items-center justify-between h-14 bg-white border-b border-[#e2e8f0] px-6 shadow-sm shrink-0 z-30">
      <div className="flex items-center gap-2">
        <button onClick={() => dispatch({ type: 'SET_SCREEN', payload: 'projects' })} className="px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 transition-colors border border-transparent hover:border-[#cbd5e1] rounded-sm flex items-center gap-1.5" title="Project Library">
          <Home className="w-4 h-4" />
          <span className="hidden sm:inline">Projects</span>
        </button>

        <div className="h-6 w-px bg-[#e2e8f0] mx-2" />

        <input 
          type="text"
          value={project.name}
          onChange={(e) => dispatch({ type: 'UPDATE_PROJECT_NAME', payload: e.target.value })}
          className="font-bold tracking-tight text-lg text-[#0f172a] mr-4 w-48 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-[#4f46e5] rounded px-1" 
          title="Project Name"
        />
        
        <div className="h-6 w-px bg-[#e2e8f0] mx-2" />
        
        <div className="flex items-center gap-1 pr-4 mr-2 border-r border-[#e2e8f0]">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Scene:</span>
          <select 
            value={activeSceneIndex}
            onChange={(e) => dispatch({ type: 'SET_ACTIVE_SCENE', payload: Number(e.target.value) })}
            className="text-xs font-bold text-[#1e293b] bg-transparent border-none focus:outline-none cursor-pointer"
          >
            {project.scenes.map((scene, index) => (
              <option key={scene.id} value={index}>{scene.name}</option>
            ))}
          </select>
        </div>
        
        <button onClick={handleNewScene} className="px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 transition-colors border border-transparent hover:border-[#cbd5e1] rounded-sm flex items-center gap-1.5" title="New Scene">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Scene</span>
        </button>
        <button onClick={() => dispatch({ type: 'DUPLICATE_SCENE', payload: activeSceneIndex })} className="px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 transition-colors border border-transparent hover:border-[#cbd5e1] rounded-sm flex items-center gap-1.5" title="Duplicate Scene">
          <Copy className="w-4 h-4" />
          <span className="hidden sm:inline">Duplicate</span>
        </button>
        <button onClick={() => dispatch({ type: 'DELETE_SCENE', payload: activeSceneIndex })} disabled={project.scenes.length <= 1} className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors border border-transparent hover:border-[#cbd5e1] rounded-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5" title="Delete Scene">
          <Trash2 className="w-4 h-4" />
          <span className="hidden sm:inline">Delete</span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 border-r border-[#e2e8f0] pr-4 mr-2">
          <button
            onClick={() => dispatch({ type: 'UNDO' })}
            disabled={!canUndo}
            className="px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 transition-colors border border-transparent hover:border-[#cbd5e1] rounded-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            title="Undo (Ctrl/Cmd+Z)"
          >
            <Undo2 className="w-4 h-4" />
            <span className="hidden sm:inline">Undo</span>
          </button>

          <button
            onClick={() => dispatch({ type: 'REDO' })}
            disabled={!canRedo}
            className="px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 transition-colors border border-transparent hover:border-[#cbd5e1] rounded-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            title="Redo (Ctrl+Y / Cmd+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
            <span className="hidden sm:inline">Redo</span>
          </button>

          <button onClick={() => dispatch({ type: 'SAVE_PROJECT' })} className="px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 transition-colors border border-transparent hover:border-[#cbd5e1] rounded-sm flex items-center gap-1.5" title="Save Project">
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline">Save</span>
          </button>

          <label className="px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 transition-colors border border-transparent hover:border-[#cbd5e1] rounded-sm cursor-pointer flex items-center gap-1.5" title="Load Project">
            <FolderOpen className="w-4 h-4" />
            <span className="hidden sm:inline">Import</span>
            <input type="file" accept=".json" className="hidden" onChange={handleImport} />
          </label>
          
          <button onClick={() => exportProject(project)} className="px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 transition-colors border border-transparent hover:border-[#cbd5e1] rounded-sm flex items-center gap-1.5" title="Export Project">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>

        <button onClick={() => dispatch({ type: 'SET_MODE', payload: 'presentation' })} className="px-4 py-2 bg-[#4f46e5] text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[#4338ca] transition-all" title="Start Presentation">
          <Play className="w-4 h-4 fill-current" />
          Presentation Mode
        </button>
      </div>
    </div>
  );
}
