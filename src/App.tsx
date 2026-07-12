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

  useEffect(() => {
    if (state.mode === 'presentation' || state.currentScreen !== 'editor') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
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

      if (event.target instanceof HTMLInputElement && event.target.type === 'file') {
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
  }, [canRedo, canUndo, dispatch, state.currentScreen, state.mode]);

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
