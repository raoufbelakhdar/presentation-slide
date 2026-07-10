/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
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
  const { state } = useAppContext();
  const [isSequenceTimelineCollapsed, setIsSequenceTimelineCollapsed] = useState(false);
  const [isScenesTimelineCollapsed, setIsScenesTimelineCollapsed] = useState(false);

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
