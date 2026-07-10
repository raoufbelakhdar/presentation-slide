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
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_45%,#ffffff_100%)] text-[#0f172a]">
      <div className="mx-auto flex max-w-7xl flex-col px-6 py-10 lg:px-10">
        <div className="mb-8 flex flex-col gap-6 rounded-[28px] border border-white/60 bg-white/80 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex rounded-full border border-[#c7d2fe] bg-[#eef2ff] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-[#4f46e5]">
                Project Library
              </div>
              <h1 className="text-4xl font-black tracking-tight text-[#0f172a]">Build, save, and reopen your scene projects.</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
                Start a fresh project, jump back into an existing one, or import a saved JSON file into your local library.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => dispatch({ type: 'CREATE_PROJECT' })}
                className="inline-flex items-center gap-2 rounded-xl bg-[#4f46e5] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#4338ca]"
              >
                <Plus className="h-4 w-4" />
                New Project
              </button>

              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#dbe4f0] bg-white px-5 py-3 text-sm font-bold text-slate-600 transition-colors hover:border-[#4f46e5] hover:text-[#4f46e5]">
                <Upload className="h-4 w-4" />
                Import Project
                <input type="file" accept=".json" className="hidden" onChange={handleImport} />
              </label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Saved Projects</div>
              <div className="mt-2 text-3xl font-black text-[#0f172a]">{state.projects.length}</div>
            </div>
            <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Total Scenes</div>
              <div className="mt-2 text-3xl font-black text-[#0f172a]">
                {state.projects.reduce((total, project) => total + project.scenes.length, 0)}
              </div>
            </div>
            <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Shared Templates</div>
              <div className="mt-2 text-3xl font-black text-[#0f172a]">
                {state.templates.length}
              </div>
            </div>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="flex min-h-[340px] flex-col items-center justify-center rounded-[28px] border border-dashed border-[#cbd5e1] bg-white/70 p-10 text-center shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
            <div className="mb-4 rounded-full bg-[#eef2ff] p-4 text-[#4f46e5]">
              <FolderOpen className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-[#0f172a]">No saved projects yet</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
              Create your first project to start arranging scenes and building your visual learning flow.
            </p>
            <button
              onClick={() => dispatch({ type: 'CREATE_PROJECT' })}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#4f46e5] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#4338ca]"
            >
              <Plus className="h-4 w-4" />
              Create First Project
            </button>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className="flex min-h-[260px] flex-col rounded-[26px] border border-white/70 bg-white p-6 shadow-[0_22px_70px_rgba(15,23,42,0.07)] transition-transform hover:-translate-y-1"
              >
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">Project</div>
                    <h2 className="mt-2 truncate text-2xl font-black tracking-tight text-[#0f172a]">{project.name}</h2>
                  </div>
                  <button
                    onClick={() => dispatch({ type: 'DELETE_PROJECT', payload: project.id })}
                    className="rounded-lg border border-[#e2e8f0] p-2 text-slate-400 transition-colors hover:border-rose-300 hover:text-rose-500"
                    title="Delete Project"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mb-5 rounded-2xl border border-[#e2e8f0] bg-[linear-gradient(135deg,#f8fafc_0%,#eef2ff_100%)] p-4">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Scenes</div>
                      <div className="mt-2 text-2xl font-black text-[#0f172a]">{project.scenes.length}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Assets</div>
                      <div className="mt-2 text-2xl font-black text-[#0f172a]">{project.assets.length}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Updated</div>
                      <div className="mt-2 text-sm font-black text-[#0f172a]">{formatProjectDate(project.updatedAt)}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-auto">
                  <div className="mb-4 text-xs font-medium text-slate-500">Last saved {formatProjectDate(project.updatedAt)}</div>
                  <button
                    onClick={() => dispatch({ type: 'OPEN_PROJECT', payload: project.id })}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#c7d2fe] bg-[#eef2ff] px-4 py-3 text-sm font-bold text-[#4f46e5] transition-colors hover:border-[#4f46e5] hover:bg-white"
                  >
                    <FolderOpen className="h-4 w-4" />
                    Open Project
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
