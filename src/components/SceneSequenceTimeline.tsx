import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { AnimationType } from '../types';
import { getSceneSequenceCount } from '../utils';

const animationLabels: Record<AnimationType, string> = {
  none: 'No animation',
  fade: 'Fade',
  'slide-up': 'Slide Up',
  'slide-left': 'Slide Left',
  scale: 'Scale',
};

export function SceneSequenceTimeline() {
  const { state, dispatch } = useAppContext();
  const { project, activeSceneIndex, selectedSequenceStep } = state;
  const activeScene = project.scenes[activeSceneIndex];

  if (!activeScene) return null;

  const sequenceCount = getSceneSequenceCount(activeScene);
  const steps = Array.from({ length: sequenceCount }, (_, index) => index + 1);
  const selectedConfig = selectedSequenceStep
    ? activeScene.sequences?.find((sequence) => sequence.step === selectedSequenceStep)
    : null;

  return (
    <div className="shrink-0 border-t border-[#dbe4f0] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#4f46e5]">
            Active Scene Sequence Timeline
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="truncate text-sm font-semibold text-[#0f172a]">{activeScene.name}</h3>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              {sequenceCount} steps
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {selectedSequenceStep !== null
              ? `Previewing step ${String(selectedSequenceStep).padStart(2, '0')} with ${animationLabels[selectedConfig?.animationType || 'fade']} animation${selectedConfig ? `, ${selectedConfig.duration}s duration, ${selectedConfig.delay}s delay` : ''}.`
              : 'Full scene preview is active. Select a step below to focus the canvas on that sequence.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectedSequenceStep !== null && sequenceCount > 1 && (
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: 'DELETE_SEQUENCE',
                  payload: { sceneIndex: activeSceneIndex, sequenceStep: selectedSequenceStep },
                })
              }
              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-rose-600 transition-colors hover:bg-rose-100"
              title={`Delete step ${selectedSequenceStep}`}
            >
              <span className="flex items-center gap-1.5">
                <Trash2 className="h-3 w-3" />
                Delete Step
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => dispatch({ type: 'ADD_SEQUENCE', payload: activeSceneIndex })}
            className="rounded-md border border-[#c7d2fe] bg-indigo-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#4f46e5] transition-colors hover:border-[#4f46e5] hover:bg-indigo-100"
            title="Add Sequence"
          >
            <span className="flex items-center gap-1.5">
              <Plus className="h-3 w-3" />
              Add Sequence
            </span>
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => dispatch({ type: 'SELECT_SEQUENCE', payload: null })}
          className={`shrink-0 rounded-xl border px-4 py-3 text-left transition-all ${
            selectedSequenceStep === null
              ? 'border-[#4f46e5] bg-[#eef2ff] text-[#312e81] shadow-[0_12px_25px_rgba(79,70,229,0.12)]'
              : 'border-[#e2e8f0] bg-white text-slate-500 hover:border-[#4f46e5] hover:bg-slate-50'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.22em]">Full Scene</div>
          <div className="mt-1 text-xs font-semibold">All visible layers</div>
          <div className="mt-1 text-[11px] text-slate-400">Preview the complete scene composition</div>
        </button>

        {steps.map((step, index) => {
          const elementsInStep = activeScene.elements.filter((element) => element.revealStep === step);
          const config = activeScene.sequences?.find((sequence) => sequence.step === step);
          const isSelected = selectedSequenceStep === step;

          return (
            <React.Fragment key={step}>
              <button
                type="button"
                onClick={() => dispatch({ type: 'SELECT_SEQUENCE', payload: step })}
                className={`min-w-[176px] shrink-0 rounded-xl border px-4 py-3 text-left transition-all ${
                  isSelected
                    ? 'border-[#4f46e5] bg-[#eef2ff] text-[#312e81] shadow-[0_12px_25px_rgba(79,70,229,0.12)]'
                    : 'border-[#dbe4f0] bg-white text-slate-600 hover:border-[#4f46e5] hover:bg-slate-50'
                }`}
                title={`${elementsInStep.length} elements reveal on step ${step}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em]">
                      Step {String(step).padStart(2, '0')}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-[#0f172a]">
                      {elementsInStep.length} reveal {elementsInStep.length === 1 ? 'item' : 'items'}
                    </div>
                  </div>
                  <div className={`mt-0.5 rounded-full px-2 py-1 text-[10px] font-bold ${isSelected ? 'bg-white text-[#4f46e5]' : 'bg-slate-100 text-slate-500'}`}>
                    S{step}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-[11px]">
                  <span className={isSelected ? 'text-[#4338ca]' : 'text-slate-500'}>
                    {animationLabels[config?.animationType || 'fade']}
                  </span>
                  <span className={isSelected ? 'text-[#6366f1]' : 'text-slate-400'}>
                    {config ? `${config.duration}s + ${config.delay}s` : '0.4s + 0s'}
                  </span>
                </div>
              </button>

              {index < steps.length - 1 && (
                <div className="h-px w-8 shrink-0 bg-[linear-gradient(90deg,#c7d2fe_0%,#e2e8f0_100%)]" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
