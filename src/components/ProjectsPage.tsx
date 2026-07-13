import React from 'react';
import { FolderOpen, Plus, Trash2, Upload } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { readTextFile } from '../utils';

function formatProjectDate(value?: string) {
  if (!value) return 'Just now';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ProjectsPage() {
  const { state, dispatch } = useAppContext();
  const projects = [...state.projects].sort((left, right) => {
    return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
  });

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await readTextFile(file);
      const importedProject = JSON.parse(text);
      if (importedProject && importedProject.scenes) {
        dispatch({ type: 'LOAD_PROJECT', payload: importedProject });
      } else {
        alert('Invalid project file');
      }
    } catch (error) {
      console.error('Failed to import project', error);
      alert('Invalid project file');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fbfcfe_0%,#f3f6fb_100%)] text-[#0f172a]">
      <div className="mx-auto flex max-w-4xl flex-col px-5 py-8 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 border-b border-[#e2e8f0] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">Project Library</div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-[#0f172a]">Projects</h1>
            <p className="mt-1 text-sm text-slate-500">
              {projects.length} saved {projects.length === 1 ? 'project' : 'projects'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => dispatch({ type: 'CREATE_PROJECT' })}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0f172a] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#1e293b]"
            >
              <Plus className="h-4 w-4" />
              New
            </button>

            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#dbe4f0] bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:border-[#94a3b8] hover:text-[#0f172a]">
              <Upload className="h-4 w-4" />
              Import
              <input type="file" accept=".json" className="hidden" onChange={handleImport} />
            </label>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[24px] border border-dashed border-[#cbd5e1] bg-white/75 p-8 text-center shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
            <div className="mb-4 rounded-full border border-[#e2e8f0] bg-white p-4 text-slate-400">
              <FolderOpen className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">No projects yet</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
              Create a new project or import one from JSON.
            </p>
            <button
              onClick={() => dispatch({ type: 'CREATE_PROJECT' })}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#0f172a] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#1e293b]"
            >
              <Plus className="h-4 w-4" />
              Create Project
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className="group flex items-center gap-3 rounded-[20px] border border-[#e2e8f0] bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.04)] transition-colors hover:border-[#cbd5e1]"
              >
                <button
                  onClick={() => dispatch({ type: 'OPEN_PROJECT', payload: project.id })}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f8fafc] text-slate-500 ring-1 ring-[#e2e8f0] transition-colors group-hover:bg-[#eef2ff] group-hover:text-[#4f46e5]">
                    <FolderOpen className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-bold text-[#0f172a]">{project.name}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      <span>{project.scenes.length} {project.scenes.length === 1 ? 'scene' : 'scenes'}</span>
                      <span>{project.assets.length} {project.assets.length === 1 ? 'asset' : 'assets'}</span>
                      <span>Updated {formatProjectDate(project.updatedAt)}</span>
                    </div>
                  </div>
                </button>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => dispatch({ type: 'OPEN_PROJECT', payload: project.id })}
                    className="rounded-xl border border-[#dbe4f0] bg-[#f8fafc] px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-[#94a3b8] hover:bg-white"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => dispatch({ type: 'DELETE_PROJECT', payload: project.id })}
                    className="rounded-xl border border-transparent p-2 text-slate-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                    title="Delete Project"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
