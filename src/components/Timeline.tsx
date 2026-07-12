import React, { useState } from 'react';
import { useAppContext } from '../AppContext';
import { ChevronDown, ChevronLeft, ChevronRight, Copy, GripVertical, Plus, Trash2 } from 'lucide-react';
import { generateId, getSceneSequenceCount } from '../utils';
import { SceneElement } from '../types';

function getElementTone(element: SceneElement) {
  if (element.type === 'text') return 'bg-sky-400';
  if (element.type === 'image') return 'bg-amber-400';
  if (element.type === 'color') return 'bg-violet-400';
  if (element.shapeType === 'yes') return 'bg-emerald-400';
  if (element.shapeType === 'check') return 'bg-sky-400';
  return 'bg-rose-400';
}

interface TimelineProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Timeline({ collapsed, onToggleCollapse }: TimelineProps) {
  const { state, dispatch } = useAppContext();
  const { project, activeSceneIndex, selectedSequenceStep } = state;
  const activeScene = project.scenes[activeSceneIndex];
  const [draggingSceneIndex, setDraggingSceneIndex] = useState<number | null>(null);
  const [sceneDropIndex, setSceneDropIndex] = useState<number | null>(null);

  if (!activeScene) return null;

  const addScene = () => {
    dispatch({
      type: 'ADD_SCENE',
      payload: {
        id: generateId(),
        name: `Scene ${project.scenes.length + 1}`,
        elements: [],
      },
    });
  };

  const duplicateScene = (sceneIndex: number) => {
    dispatch({ type: 'DUPLICATE_SCENE', payload: sceneIndex });
  };

  const deleteScene = (sceneIndex: number) => {
    dispatch({ type: 'DELETE_SCENE', payload: sceneIndex });
  };

  const moveScene = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= project.scenes.length || fromIndex === toIndex) {
      return;
    }

    dispatch({
      type: 'MOVE_SCENE',
      payload: { fromIndex, toIndex },
    });
  };

  const selectSceneSequence = (sceneIndex: number, step: number) => {
    if (sceneIndex !== activeSceneIndex) {
      dispatch({ type: 'SET_ACTIVE_SCENE', payload: sceneIndex });
    }
    dispatch({ type: 'SELECT_SEQUENCE', payload: step });
  };

  const addSceneSequence = (sceneIndex: number, position: 'start' | 'end') => {
    if (sceneIndex !== activeSceneIndex) {
      dispatch({ type: 'SET_ACTIVE_SCENE', payload: sceneIndex });
    }
    dispatch({ type: 'ADD_SEQUENCE', payload: { sceneIndex, position } });
  };

  const deleteSceneSequence = (sceneIndex: number, step: number) => {
    dispatch({
      type: 'DELETE_SEQUENCE',
      payload: { sceneIndex, sequenceStep: step },
    });
  };

  const commitSceneReorder = (dropIndex: number | null) => {
    if (draggingSceneIndex === null || dropIndex === null) {
      setDraggingSceneIndex(null);
      setSceneDropIndex(null);
      return;
    }

    const targetIndex = draggingSceneIndex < dropIndex ? dropIndex - 1 : dropIndex;
    if (targetIndex !== draggingSceneIndex) {
      dispatch({
        type: 'MOVE_SCENE',
        payload: { fromIndex: draggingSceneIndex, toIndex: targetIndex },
      });
    }

    setDraggingSceneIndex(null);
    setSceneDropIndex(null);
  };

  const getDropIndexForCard = (event: React.DragEvent<HTMLDivElement>, index: number) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX > bounds.left + bounds.width / 2 ? index + 1 : index;
  };

  return (
    <div className={`bg-white border-t border-[#e2e8f0] flex flex-col shrink-0 overflow-hidden ${collapsed ? '' : 'h-56'}`}>
      <div className="min-h-10 border-b border-[#f1f5f9] flex items-center justify-between px-4 py-2 bg-[#f8fafc] shrink-0">
        <div className="min-w-0">
          <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest">Scenes Timeline</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs font-semibold text-[#0f172a]">Project scenes</span>
            <span className="text-[10px] font-bold text-[#4f46e5] uppercase">
              {project.scenes.length} Scenes
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded-md border border-[#dbe4f0] bg-white px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 transition-colors hover:border-[#4f46e5] hover:text-[#4f46e5]"
          title={collapsed ? 'Show scenes timeline' : 'Hide scenes timeline'}
        >
          <span className="flex items-center gap-1.5">
            <ChevronDown className={`h-3 w-3 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
            {collapsed ? 'Show' : 'Hide'}
          </span>
        </button>
      </div>

      {!collapsed && (
      <div className="flex-1 px-4 py-2 bg-white overflow-x-auto overflow-y-hidden">
        <div className="flex h-full gap-3 pb-1">
          {project.scenes.map((scene, index) => {
            const sequenceCount = getSceneSequenceCount(scene);
            const steps = Array.from({ length: sequenceCount }, (_, i) => i + 1);
            const isActive = index === activeSceneIndex;
            const isDragging = index === draggingSceneIndex;
            const showBeforeDropIndicator = sceneDropIndex === index && draggingSceneIndex !== null && draggingSceneIndex !== index;
            const showAfterDropIndicator = sceneDropIndex === index + 1 && draggingSceneIndex !== null && draggingSceneIndex !== index;
            const selectedStepInCard = isActive ? selectedSequenceStep : null;

            return (
              <div key={scene.id} className="relative shrink-0">
                {showBeforeDropIndicator && <div className="absolute left-[-6px] top-3 bottom-3 w-1 rounded-full bg-[#4f46e5]" />}
                {showAfterDropIndicator && <div className="absolute right-[-6px] top-3 bottom-3 w-1 rounded-full bg-[#4f46e5]" />}

                <div
                  role="button"
                  tabIndex={0}
                  draggable
                  onClick={() => dispatch({ type: 'SET_ACTIVE_SCENE', payload: index })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      dispatch({ type: 'SET_ACTIVE_SCENE', payload: index });
                    }
                  }}
                  onDragStart={(event) => {
                    setDraggingSceneIndex(index);
                    setSceneDropIndex(index);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', scene.id);
                  }}
                  onDragOver={(event) => {
                    if (draggingSceneIndex === null) return;
                    event.preventDefault();
                    const nextDropIndex = getDropIndexForCard(event, index);
                    setSceneDropIndex(nextDropIndex);
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    commitSceneReorder(getDropIndexForCard(event, index));
                  }}
                  onDragEnd={() => {
                    setDraggingSceneIndex(null);
                    setSceneDropIndex(null);
                  }}
                  className={`w-44 rounded-xl border p-2.5 text-left transition-all ${
                    isActive
                      ? 'border-[#4f46e5] bg-indigo-50 shadow-[0_10px_25px_rgba(79,70,229,0.12)]'
                      : 'border-[#e2e8f0] bg-white hover:border-[#4f46e5]'
                  } ${isDragging ? 'opacity-60' : ''}`}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className={`text-[10px] font-bold uppercase tracking-[0.22em] ${isActive ? 'text-[#4f46e5]' : 'text-slate-400'}`}>
                        Scene {String(index + 1).padStart(2, '0')}
                      </div>
                      <div className="mt-1 truncate text-sm font-semibold text-[#0f172a]">{scene.name}</div>
                    </div>
                    <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                  </div>

                  <div className="mb-2 rounded-lg border border-[#e2e8f0] bg-white/80 p-2">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-400">
                        Sequence Flow
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-300">
                        {sequenceCount} steps
                      </span>
                    </div>
                    <div className="flex items-center gap-1 overflow-x-auto pb-1">
                      {steps.map((step) => {
                        const elementsInStep = scene.elements.filter((element) => element.revealStep === step);
                        const isSelectedStep = isActive && selectedStepInCard === step;

                        return (
                          <div key={step} className="relative shrink-0">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                selectSceneSequence(index, step);
                              }}
                              className={`flex min-w-[40px] shrink-0 flex-col items-center rounded-md border px-2 py-1 pr-4 transition-all ${
                                isSelectedStep
                                  ? 'border-[#4f46e5] bg-indigo-50 text-[#4f46e5]'
                                  : isActive
                                    ? 'border-[#cbd5e1] bg-slate-50 text-slate-500 hover:border-[#4f46e5]'
                                    : 'border-[#e2e8f0] bg-white text-slate-400 hover:border-slate-300'
                              }`}
                              title={`${elementsInStep.length} items reveal on step ${step}`}
                            >
                              <span className="text-[8px] font-bold uppercase tracking-wider">S{step}</span>
                              <span className="mt-0.5 text-[9px] font-bold">{elementsInStep.length}</span>
                            </button>
                            {isActive && sequenceCount > 1 && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  deleteSceneSequence(index, step);
                                }}
                                className={`absolute right-0.5 top-0.5 rounded-sm p-0.5 transition-colors ${
                                  isSelectedStep
                                    ? 'text-indigo-400 hover:bg-white/80 hover:text-rose-500'
                                    : 'text-slate-300 hover:bg-white hover:text-rose-500'
                                }`}
                                title={`Delete sequence ${step}`}
                              >
                                <Trash2 className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          addSceneSequence(index, 'start');
                        }}
                        className={`flex min-w-[52px] shrink-0 items-center justify-center rounded-md border border-dashed px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition-colors ${
                          isActive
                            ? 'border-[#4f46e5]/40 bg-indigo-50 text-[#4f46e5] hover:border-[#4f46e5]'
                            : 'border-[#cbd5e1] bg-slate-50 text-slate-400 hover:border-slate-400'
                        }`}
                        title="Add Sequence At Start"
                      >
                        Start
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          addSceneSequence(index, 'end');
                        }}
                        className={`flex min-w-[48px] shrink-0 items-center justify-center rounded-md border border-dashed px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition-colors ${
                          isActive
                            ? 'border-[#4f46e5]/40 bg-indigo-50 text-[#4f46e5] hover:border-[#4f46e5]'
                            : 'border-[#cbd5e1] bg-slate-50 text-slate-400 hover:border-slate-400'
                        }`}
                        title="Add Sequence At End"
                      >
                        End
                      </button>
                    </div>
                  </div>

                  <div className="mb-2 h-12 rounded-lg border border-dashed border-[#dbe4f0] bg-[linear-gradient(135deg,#f8fafc_0%,#eef2ff_100%)] p-2.5">
                    <div className="flex h-full items-end gap-1.5">
                      {scene.elements.length === 0 ? (
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Empty Scene</div>
                      ) : (
                        scene.elements.slice(0, 6).map((element) => (
                          <div
                            key={element.id}
                            className={`w-4 rounded-t-md ${getElementTone(element)}`}
                            style={{ height: `${18 + (element.revealStep - 1) * 5}px` }}
                            title={`${element.type} • step ${element.revealStep}`}
                          />
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <span>{scene.elements.length} items</span>
                    <span>{selectedStepInCard ? `Step ${selectedStepInCard} selected` : `${sequenceCount} steps`}</span>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    {isActive && selectedSequenceStep !== null && sequenceCount > 1 && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteSceneSequence(index, selectedSequenceStep);
                        }}
                        className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-600 transition-colors hover:bg-rose-100"
                        title="Delete Selected Sequence"
                      >
                        Delete S{selectedSequenceStep}
                      </button>
                    )}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          moveScene(index, index - 1);
                        }}
                        disabled={index === 0}
                        className="rounded-md border border-[#e2e8f0] bg-white p-1 text-slate-400 transition-colors hover:border-[#4f46e5] hover:text-[#4f46e5] disabled:cursor-not-allowed disabled:opacity-40"
                        title="Move Scene Left"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          moveScene(index, index + 1);
                        }}
                        disabled={index === project.scenes.length - 1}
                        className="rounded-md border border-[#e2e8f0] bg-white p-1 text-slate-400 transition-colors hover:border-[#4f46e5] hover:text-[#4f46e5] disabled:cursor-not-allowed disabled:opacity-40"
                        title="Move Scene Right"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        duplicateScene(index);
                      }}
                      className="flex-1 rounded-md border border-[#e2e8f0] bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-colors hover:border-[#4f46e5] hover:text-[#4f46e5]"
                      title="Duplicate Scene"
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        <Copy className="h-3 w-3" />
                        Copy
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteScene(index);
                      }}
                      disabled={project.scenes.length <= 1}
                      className="rounded-md border border-[#e2e8f0] bg-white p-1 text-slate-400 transition-colors hover:border-rose-300 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Delete Scene"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={addScene}
            onDragOver={(event) => {
              if (draggingSceneIndex === null) return;
              event.preventDefault();
              setSceneDropIndex(project.scenes.length);
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              event.preventDefault();
              commitSceneReorder(project.scenes.length);
            }}
            className="flex h-full w-40 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-4 py-4 text-center transition-colors hover:border-[#4f46e5] hover:bg-indigo-50"
          >
            <Plus className="mb-2 h-5 w-5 text-slate-400" />
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Add Scene</span>
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
