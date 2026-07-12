/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AppProvider, useAppContext } from './AppContext';
import { Toolbar } from './components/Toolbar';
import { LeftSidebar } from './components/LeftSidebar';
import { RightSidebar } from './components/RightSidebar';
import { Canvas } from './components/Canvas';
import { SceneSequenceTimeline } from './components/SceneSequenceTimeline';
import { Timeline } from './components/Timeline';
import { PresentationView } from './components/PresentationView';
import { ProjectsPage } from './components/ProjectsPage';

function AppContent() {
  const { state, dispatch, canUndo, canRedo } = useAppContext();
  const [isSequenceTimelineCollapsed, setIsSequenceTimelineCollapsed] = useState(false);
  const [isScenesTimelineCollapsed, setIsScenesTimelineCollapsed] = useState(false);
  const activeScene = state.project.scenes[state.activeSceneIndex];

  useEffect(() => {
    if (state.mode === 'presentation' || state.currentScreen !== 'editor') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isFormField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (isFormField) {
        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const isDeleteKey = event.key === 'Delete' || event.key === 'Backspace';
        if (!isDeleteKey) {
          return;
        }

        if (state.selectedElementId) {
          event.preventDefault();
          dispatch({ type: 'DELETE_ELEMENT', payload: state.selectedElementId });
          return;
        }

        if (
          state.selectedSequenceStep !== null &&
          activeScene &&
          state.selectedSequenceStep >= 1 &&
          activeScene.elements.length >= 0
        ) {
          const sequenceCount = Math.max(
            activeScene.sequenceCount || 1,
            ...activeScene.elements.map((element) => element.revealStep),
            1,
          );

          if (sequenceCount > 1) {
            event.preventDefault();
            dispatch({
              type: 'DELETE_SEQUENCE',
              payload: {
                sceneIndex: state.activeSceneIndex,
                sequenceStep: state.selectedSequenceStep,
              },
            });
          }
        }

        return;
      }

      if (event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      const isUndoShortcut = key === 'z' && !event.shiftKey;
      const isRedoShortcut =
        (key === 'z' && event.shiftKey) ||
        (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey);

      if (!isUndoShortcut && !isRedoShortcut) {
        return;
      }

      if ((isUndoShortcut && !canUndo) || (isRedoShortcut && !canRedo)) {
        return;
      }

      event.preventDefault();
      dispatch({ type: isUndoShortcut ? 'UNDO' : 'REDO' });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeScene,
    canRedo,
    canUndo,
    dispatch,
    state.activeSceneIndex,
    state.currentScreen,
    state.mode,
    state.selectedElementId,
    state.selectedSequenceStep,
  ]);

  if (state.mode === 'presentation') {
    return <PresentationView />;
  }

  if (state.currentScreen === 'projects') {
    return <ProjectsPage />;
  }

  return (
    <div className="flex flex-col h-screen w-full bg-[#f8fafc] text-[#1e293b] overflow-hidden font-sans">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Canvas />
          <SceneSequenceTimeline
            collapsed={isSequenceTimelineCollapsed}
            onToggleCollapse={() => setIsSequenceTimelineCollapsed((value) => !value)}
          />
          <Timeline
            collapsed={isScenesTimelineCollapsed}
            onToggleCollapse={() => setIsScenesTimelineCollapsed((value) => !value)}
          />
        </div>
        <RightSidebar />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
