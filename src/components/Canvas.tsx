import React, { useRef, useEffect, useState } from 'react';
import { useAppContext } from '../AppContext';
import { Rnd } from 'react-rnd';
import { TextElement, ImageElement, ShapeElement } from '../types';
import { getEffectiveElementState, getTextPadding, splitTextContent } from '../utils';
import { Check, X } from 'lucide-react';

export function Canvas() {
  const { state, dispatch } = useAppContext();
  const { project, activeSceneIndex, selectedElementId, selectedSequenceStep } = state;
  const activeScene = project.scenes[activeSceneIndex];
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const padding = 96; // 48px p-12 * 2
        const availableWidth = containerRef.current.clientWidth - padding;
        const availableHeight = containerRef.current.clientHeight - padding;
        const scaleX = availableWidth / 1920;
        const scaleY = availableHeight / 1080;
        setScale(Math.min(scaleX, scaleY));
      }
    };

    handleResize();
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!activeScene) return null;

  const currentStep = selectedSequenceStep !== null ? selectedSequenceStep : 0;
  const orderedElements = [...activeScene.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  return (
    <div 
      ref={containerRef}
      className="flex-1 bg-[#f1f5f9] relative p-12 overflow-hidden flex items-center justify-center"
      onClick={() => dispatch({ type: 'SELECT_ELEMENT', payload: null })}
    >
      <div 
        className="bg-white border border-[#cbd5e1] relative shadow-2xl shrink-0"
        style={{ 
          width: '1920px', 
          height: '1080px',
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          backgroundImage: 'radial-gradient(#e2e8f0 1px, transparent 1px)', 
          backgroundSize: '20px 20px' 
        }}
        onClick={() => dispatch({ type: 'SELECT_ELEMENT', payload: null })}
      >
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none border-[12px] border-transparent outline outline-1 outline-slate-200 outline-offset-[-12px]"></div>
        {orderedElements.map(element => {
          if (selectedSequenceStep !== null) {
            if (element.revealStep > selectedSequenceStep) return null;
            
            const effectiveElement = getEffectiveElementState(element, selectedSequenceStep);
            if (effectiveElement.hidden) return null;

            return (
              <CanvasElement
                key={`${element.id}-${currentStep}`}
                element={effectiveElement}
                isSelected={element.id === selectedElementId}
                scale={scale}
              />
            );
          } else {
            return (
              <CanvasElement
                key={`${element.id}-${currentStep}`}
                element={element}
                isSelected={element.id === selectedElementId}
                scale={scale}
              />
            );
          }
        })}
      </div>
    </div>
  );
}

function CanvasElement({ element, isSelected, scale }: { element: any, isSelected: boolean, scale: number, key?: React.Key }) {
  const { state, dispatch } = useAppContext();
  const [isEditingText, setIsEditingText] = useState(false);
  const [frame, setFrame] = useState({
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  });
  const frameRef = useRef(frame);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textParts = element.type === 'text' ? splitTextContent(element.text) : null;
  const subtitleLines = textParts?.subtitle ? textParts.subtitle.split('\n').filter(Boolean) : [];
  const subtitleFontSize = element.type === 'text' ? (element.subtitleFontSize || element.fontSize * 0.6) : 0;
  const textPadding = element.type === 'text' ? getTextPadding(element) : 0;

  const syncFrame = (nextFrame: typeof frame | ((current: typeof frame) => typeof frame)) => {
    setFrame((current) => {
      const resolvedFrame = typeof nextFrame === 'function' ? nextFrame(current) : nextFrame;
      frameRef.current = resolvedFrame;
      return resolvedFrame;
    });
  };

  useEffect(() => {
    const nextFrame = {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    };
    frameRef.current = nextFrame;
    setFrame(nextFrame);
  }, [element.id, element.x, element.y, element.width, element.height]);

  const handleDrag = (e: any, d: any) => {
    syncFrame((current) => ({ ...current, x: d.x, y: d.y }));
  };

  const handleDragStop = () => {
    const { x, y } = frameRef.current;
    dispatch({ type: 'UPDATE_ELEMENT', payload: { id: element.id, updates: { x, y } } });
  };

  const handleResize = (e: any, direction: any, ref: any, delta: any, position: any) => {
    syncFrame({
      width: ref.offsetWidth,
      height: ref.offsetHeight,
      x: position.x,
      y: position.y,
    });
  };

  const handleResizeStop = () => {
    const { x, y, width, height } = frameRef.current;
    dispatch({ 
      type: 'UPDATE_ELEMENT', 
      payload: { 
        id: element.id, 
        updates: { 
          width,
          height,
          x,
          y,
        } 
      } 
    });
  };

  const selectElement = () => {
    if (!isSelected) {
      dispatch({ type: 'SELECT_ELEMENT', payload: element.id });
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectElement();
    if (element.type === 'text') {
      setIsEditingText(true);
    } else if (element.type === 'image') {
      fileInputRef.current?.click();
    }
  };

  return (
    <Rnd
      size={{ width: frame.width, height: frame.height }}
      position={{ x: frame.x, y: frame.y }}
      onDrag={handleDrag}
      onDragStop={handleDragStop}
      onResize={handleResize}
      onResizeStop={handleResizeStop}
      onDragStart={selectElement}
      onResizeStart={selectElement}
      disableDragging={isEditingText}
      bounds="parent"
      scale={scale}
      className={`absolute z-10`}
      style={{ zIndex: (element.zIndex ?? 0) + (isSelected ? 10000 : 0) }}
      dragHandleClassName="drag-handle"
    >
      <div 
        className={`w-full h-full drag-handle cursor-move flex relative ${isSelected ? 'ring-2 ring-[#4f46e5]' : 'hover:ring-1 hover:ring-[#4f46e5]/50'}`} 
        onDoubleClick={handleDoubleClick}
        onClick={(e) => {
          e.stopPropagation();
          selectElement();
        }}
      >
        {isSelected && (
          <div className="absolute -top-4 right-0 bg-[#4f46e5] text-white text-[10px] px-1.5 py-0.5 font-bold uppercase tracking-wider">
            SEQ {element.revealStep}
          </div>
        )}
        
        {element.type === 'text' && (
          isEditingText ? (
            <textarea
              autoFocus
              className="w-full h-full text-center whitespace-pre-wrap break-words outline-none resize-none shadow-2xl rounded-[100px]"
              style={{ 
                padding: `${textPadding}px`,
                fontSize: `${element.fontSize}px`, 
                fontWeight: element.fontWeight, 
                color: element.color,
                backgroundColor: '#3b82f6'
              }}
              value={element.text}
              onChange={(e) => dispatch({ type: 'UPDATE_ELEMENT', payload: { id: element.id, updates: { text: e.target.value } } })}
              onBlur={() => setIsEditingText(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setIsEditingText(false);
              }}
            />
          ) : (
            <div 
              className="w-full h-full flex flex-col items-center justify-center text-center shadow-2xl pointer-events-none rounded-[100px]"
              style={{ backgroundColor: '#3b82f6', color: element.color, padding: `${textPadding}px` }}
            >
              {textParts && (
                <>
                  <div style={{ 
                    fontSize: `${element.fontSize}px`,
                    fontWeight: element.fontWeight,
                    opacity: 1,
                    lineHeight: 1.1,
                  }}>
                    {textParts.title}
                  </div>
                  {subtitleLines.map((line: string, i: number) => (
                    <div key={i} style={{ 
                      fontSize: `${subtitleFontSize}px`,
                      fontWeight: 'normal',
                      opacity: 0.9,
                      lineHeight: 1.1,
                      marginTop: i === 0 ? '6px' : '2px'
                    }}>
                      {line}
                    </div>
                  ))}
                </>
              )}
            </div>
          )
        )}

        {element.type === 'image' && (
          <>
            <ImageRenderer element={element} />
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const dataUrl = ev.target?.result as string;
                    const newAssetId = Math.random().toString(36).substring(2, 9);
                    dispatch({
                      type: 'ADD_ASSET',
                      payload: { id: newAssetId, name: file.name, dataUrl }
                    });
                    dispatch({
                      type: 'UPDATE_ELEMENT',
                      payload: { id: element.id, updates: { assetId: newAssetId } }
                    });
                  };
                  reader.readAsDataURL(file);
                }
              }}
            />
          </>
        )}

        {element.type === 'shape' && (
          <ShapeRenderer element={element as ShapeElement} />
        )}
      </div>
    </Rnd>
  );
}

function ImageRenderer({ element }: { element: ImageElement }) {
  const { state } = useAppContext();
  const asset = state.project.assets.find(a => a.id === element.assetId);
  const captionText = element.captionText?.trim() || '';

  if (!asset) {
    return <div className="w-full h-full bg-[#f1f5f9] border border-[#cbd5e1] flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Image not found</div>;
  }

  return (
    <div
      className="w-full h-full bg-white p-3 shadow-xl flex flex-col border border-slate-200 pointer-events-none relative"
      style={{ paddingBottom: '4.5rem' }}
    >
      <img 
        src={asset.dataUrl} 
        alt={asset.name} 
        className="w-full h-full object-cover border border-slate-100" 
        draggable={false}
      />
      <div className="absolute inset-x-3 bottom-3 flex h-11 items-center justify-center border-t border-slate-200/80 text-center text-[14px] font-extrabold uppercase tracking-[0.2em] text-slate-700">
        {captionText}
      </div>
    </div>
  );
}

function ShapeRenderer({ element }: { element: ShapeElement }) {
  if (element.shapeType === 'yes') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#3b82f6] rounded-[100px] shadow-2xl text-white pointer-events-none">
        <Check className="w-1/3 h-1/3" strokeWidth={3} />
        <span className="text-lg font-semibold tracking-[0.18em] mt-2">NAAM</span>
        <span className="text-3xl font-bold mt-1">YES</span>
      </div>
    );
  }

  if (element.shapeType === 'no') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#ef4444] rounded-[100px] shadow-2xl text-white pointer-events-none">
        <X className="w-1/3 h-1/3" strokeWidth={3} />
        <span className="text-lg font-semibold tracking-[0.18em] mt-2">LA</span>
        <span className="text-3xl font-bold mt-1">NO</span>
      </div>
    );
  }

  if (element.shapeType === 'check') {
    return (
      <div className="w-full h-full flex items-center justify-center text-[#0ea5e9] pointer-events-none">
        <Check className="h-full w-full drop-shadow-[0_12px_20px_rgba(14,165,233,0.28)]" strokeWidth={4} />
      </div>
    );
  }

  if (element.shapeType === 'cross') {
    return (
      <div className="w-full h-full flex items-center justify-center text-[#ef4444] pointer-events-none">
        <X className="h-full w-full drop-shadow-[0_12px_20px_rgba(239,68,68,0.28)]" strokeWidth={4} />
      </div>
    );
  }

  return null;
}
