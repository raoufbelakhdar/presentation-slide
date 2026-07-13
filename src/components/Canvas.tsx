import React, { useRef, useEffect, useState } from 'react';
import { useAppContext } from '../AppContext';
import { Rnd } from 'react-rnd';
import { TextElement, ImageElement, ShapeElement, ColorElement } from '../types';
import { getEffectiveElementState, getTextAlign, getTextPadding, getTextSubtitleFontSize, getTextVariant, splitTextContent } from '../utils';
import { Check, X } from 'lucide-react';
import { LucideIconGlyph } from './LucideIconGlyph';
import { EmojiGlyph } from './EmojiGlyph';

type CanvasBackgroundMode = 'light' | 'gray' | 'dark';

const CANVAS_BACKGROUND_STORAGE_KEY = 'visual-learning-canvas-background-mode';

const CANVAS_BACKGROUND_MODES: Record<
  CanvasBackgroundMode,
  {
    label: string;
    shellBackground: string;
    stageBackground: string;
    stageBorder: string;
    stageOutline: string;
    gridColor: string;
  }
> = {
  light: {
    label: 'Light',
    shellBackground: '#f1f5f9',
    stageBackground: '#ffffff',
    stageBorder: '#cbd5e1',
    stageOutline: '#e2e8f0',
    gridColor: '#e2e8f0',
  },
  gray: {
    label: 'Gray',
    shellBackground: '#d7dde5',
    stageBackground: '#94a3b8',
    stageBorder: '#64748b',
    stageOutline: '#cbd5e1',
    gridColor: '#cbd5e1',
  },
  dark: {
    label: 'Dark',
    shellBackground: '#0f172a',
    stageBackground: '#1e293b',
    stageBorder: '#475569',
    stageOutline: '#64748b',
    gridColor: '#334155',
  },
};

export function Canvas() {
  const { state, dispatch } = useAppContext();
  const { project, activeSceneIndex, selectedElementId, selectedElementIds, selectedSequenceStep } = state;
  const activeScene = project.scenes[activeSceneIndex];
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>(() => {
    if (typeof window === 'undefined') {
      return 'gray';
    }

    const storedMode = window.localStorage.getItem(CANVAS_BACKGROUND_STORAGE_KEY);
    if (storedMode === 'gray' || storedMode === 'dark' || storedMode === 'light') {
      return storedMode;
    }

    return 'gray';
  });

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

  useEffect(() => {
    window.localStorage.setItem(CANVAS_BACKGROUND_STORAGE_KEY, backgroundMode);
  }, [backgroundMode]);

  if (!activeScene) return null;

  const currentStep = selectedSequenceStep !== null ? selectedSequenceStep : 0;
  const orderedElements = [...activeScene.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const backgroundConfig = CANVAS_BACKGROUND_MODES[backgroundMode];

  return (
    <div 
      ref={containerRef}
      className="flex-1 relative p-12 overflow-hidden flex items-center justify-center"
      style={{ backgroundColor: backgroundConfig.shellBackground }}
      onClick={() => dispatch({ type: 'SELECT_ELEMENT', payload: null })}
    >
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full border border-white/40 bg-white/80 px-2 py-1 shadow-sm backdrop-blur">
        {(['light', 'gray', 'dark'] as CanvasBackgroundMode[]).map((mode) => {
          const modeConfig = CANVAS_BACKGROUND_MODES[mode];
          const isActive = backgroundMode === mode;

          return (
            <button
              key={mode}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setBackgroundMode(mode);
              }}
              className={`flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                isActive
                  ? 'bg-[#0f172a] text-white'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
              title={`${modeConfig.label} canvas background`}
            >
              <span
                className="h-3 w-3 rounded-full border border-black/10"
                style={{ backgroundColor: modeConfig.stageBackground }}
              />
              {modeConfig.label}
            </button>
          );
        })}
      </div>

      <div 
        className="relative shadow-2xl shrink-0"
        style={{ 
          width: '1920px', 
          height: '1080px',
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          backgroundColor: backgroundConfig.stageBackground,
          border: `1px solid ${backgroundConfig.stageBorder}`,
          backgroundImage: `radial-gradient(${backgroundConfig.gridColor} 1px, transparent 1px)`,
          backgroundSize: '20px 20px',
        }}
        onClick={() => dispatch({ type: 'SELECT_ELEMENT', payload: null })}
      >
        <div
          className="absolute top-0 left-0 w-full h-full pointer-events-none border-[12px] border-transparent outline outline-1 outline-offset-[-12px]"
          style={{ outlineColor: backgroundConfig.stageOutline }}
        ></div>
        {orderedElements.map(element => {
          if (selectedSequenceStep !== null) {
            if (element.revealStep > selectedSequenceStep) return null;
            
            const effectiveElement = getEffectiveElementState(element, selectedSequenceStep);
            const isSelected = selectedElementIds.includes(element.id);
            if (effectiveElement.hidden && !isSelected) return null;

            return (
              <CanvasElement
                key={`${element.id}-${currentStep}`}
                element={effectiveElement}
                isSelected={isSelected}
                isPrimarySelected={element.id === selectedElementId}
                isHiddenPreview={Boolean(effectiveElement.hidden && isSelected)}
                scale={scale}
              />
            );
          } else {
            return (
              <CanvasElement
                key={`${element.id}-${currentStep}`}
                element={element}
                isSelected={selectedElementIds.includes(element.id)}
                isPrimarySelected={element.id === selectedElementId}
                isHiddenPreview={false}
                scale={scale}
              />
            );
          }
        })}
      </div>
    </div>
  );
}

function CanvasElement({
  element,
  isSelected,
  isPrimarySelected,
  isHiddenPreview,
  scale,
}: {
  element: any,
  isSelected: boolean,
  isPrimarySelected: boolean,
  isHiddenPreview: boolean,
  scale: number,
  key?: React.Key
}) {
  const { dispatch } = useAppContext();
  type Frame = {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  const [isEditingText, setIsEditingText] = useState(false);
  const [frame, setFrame] = useState<Frame>({
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  });
  const frameRef = useRef(frame);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textParts = element.type === 'text' ? splitTextContent(element.text) : null;
  const textVariant = element.type === 'text' ? getTextVariant(element) : 'block';
  const textAlign = element.type === 'text' ? getTextAlign(element) : 'center';
  const subtitleLines = textParts?.subtitle ? textParts.subtitle.split('\n').filter(Boolean) : [];
  const subtitleFontSize = element.type === 'text' ? getTextSubtitleFontSize(element) : 0;
  const textPadding = element.type === 'text' && textVariant === 'block' ? getTextPadding(element) : 0;
  const blockTextPaddingX = textPadding;

  const syncFrame = (nextFrame: Frame | ((current: Frame) => Frame)) => {
    const resolvedFrame = typeof nextFrame === 'function' ? nextFrame(frameRef.current) : nextFrame;
    frameRef.current = resolvedFrame;
    setFrame(resolvedFrame);
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

  const selectElement = (event?: Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'> | Pick<React.MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>) => {
    const isMultiSelect = Boolean(event?.ctrlKey || event?.metaKey || event?.shiftKey);

    if (isMultiSelect) {
      dispatch({ type: 'TOGGLE_ELEMENT_SELECTION', payload: element.id });
      return;
    }

    if (!isSelected || !isPrimarySelected) {
      dispatch({ type: 'SELECT_ELEMENT', payload: element.id });
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({ type: 'SELECT_ELEMENT', payload: element.id });
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
      onDragStart={(event) => selectElement(event as MouseEvent)}
      onResizeStart={(event) => selectElement(event as MouseEvent)}
      disableDragging={isEditingText}
      bounds="parent"
      scale={scale}
      className={`absolute z-10`}
      style={{ zIndex: (element.zIndex ?? 0) + (isSelected ? 10000 : 0) }}
      dragHandleClassName="drag-handle"
    >
      <div 
        className={`w-full h-full drag-handle cursor-move flex relative ${
          isSelected ? 'ring-2 ring-[#4f46e5]' : 'hover:ring-1 hover:ring-[#4f46e5]/50'
        } ${isHiddenPreview ? 'opacity-40 border-2 border-dashed border-rose-400' : ''}`} 
        onDoubleClick={handleDoubleClick}
        onClick={(e) => {
          e.stopPropagation();
          selectElement(e);
        }}
      >
        {isPrimarySelected && (
          <div className={`absolute -top-4 right-0 text-white text-[10px] px-1.5 py-0.5 font-bold uppercase tracking-wider ${
            isHiddenPreview ? 'bg-rose-500' : 'bg-[#4f46e5]'
          }`}>
            {isHiddenPreview ? 'HIDDEN' : `SEQ ${element.revealStep}`}
          </div>
        )}
        
        {element.type === 'text' && (
          isEditingText ? (
            <textarea
              autoFocus
              className={`w-full h-full whitespace-pre-wrap break-words outline-none resize-none ${
                textVariant === 'block' ? 'text-center shadow-2xl rounded-[100px]' : 'bg-transparent text-left'
              }`}
              style={{ 
                padding: textVariant === 'block' ? `${textPadding}px ${blockTextPaddingX}px` : '0px',
                fontSize: `${element.fontSize}px`, 
                fontWeight: element.fontWeight, 
                color: element.color,
                backgroundColor: textVariant === 'block' ? '#3b82f6' : 'transparent',
                lineHeight: 1.12,
                textAlign,
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
              className={`w-full h-full pointer-events-none ${
                textVariant === 'block'
                  ? 'flex flex-col items-center justify-center text-center shadow-2xl rounded-[100px]'
                  : 'flex flex-col items-start justify-start text-left'
              }`}
              style={{
                backgroundColor: textVariant === 'block' ? '#3b82f6' : 'transparent',
                color: element.color,
                padding: textVariant === 'block' ? `${textPadding}px ${blockTextPaddingX}px` : '0px',
              }}
            >
              {textVariant === 'block' && textParts && (
                <div className="w-full h-full flex flex-col justify-center" style={{ textAlign }}>
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
                </div>
              )}
              {textVariant === 'free' && (
                <div
                  className="w-full whitespace-pre-wrap break-words"
                  style={{
                    fontSize: `${element.fontSize}px`,
                    fontWeight: element.fontWeight,
                    lineHeight: 1.12,
                    textAlign,
                  }}
                >
                  {element.text}
                </div>
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

        {element.type === 'color' && (
          <ColorCardRenderer element={element as ColorElement} />
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
  const hasCaption = captionText.length > 0;
  const baseSize = Math.min(element.width, element.height);
  const shellPadding = 5;
  const frameGap = Math.max(3, Math.min(8, Math.round(baseSize * 0.03)));
  const captionHeight = Math.max(16, Math.min(44, Math.round(element.height * 0.18)));
  const captionTextSize = Math.max(9, Math.min(14, Math.round(baseSize * 0.075)));

  if (!asset) {
    return <div className="w-full h-full bg-[#f1f5f9] border border-[#cbd5e1] flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Image not found</div>;
  }

  return (
    <div
      className="w-full h-full bg-white shadow-xl flex flex-col border border-slate-200 pointer-events-none relative"
      style={{ padding: `${shellPadding}px`, paddingBottom: `${shellPadding + (hasCaption ? captionHeight + frameGap : 0)}px` }}
    >
      <img 
        src={asset.dataUrl} 
        alt={asset.name} 
        className="w-full h-full object-cover border border-slate-100" 
        draggable={false}
      />
      {hasCaption && (
        <div
          className="absolute flex items-center justify-center border-t border-slate-200/80 text-center font-extrabold uppercase text-slate-700"
          style={{
            left: shellPadding,
            right: shellPadding,
            bottom: shellPadding,
            height: captionHeight,
            fontSize: `${captionTextSize}px`,
            letterSpacing: `${Math.max(1, Math.round(captionTextSize * 0.18))}px`,
          }}
        >
          {captionText}
        </div>
      )}
    </div>
  );
}

function ColorCardRenderer({ element }: { element: ColorElement }) {
  const captionText = element.captionText?.trim() || '';
  const hasCaption = captionText.length > 0;
  const baseSize = Math.min(element.width, element.height);
  const shellPadding = Math.max(6, Math.min(20, Math.round(baseSize * 0.08)));
  const frameGap = Math.max(3, Math.min(8, Math.round(baseSize * 0.03)));
  const captionHeight = Math.max(16, Math.min(44, Math.round(element.height * 0.18)));
  const captionTextSize = Math.max(9, Math.min(14, Math.round(baseSize * 0.075)));

  return (
    <div
      className="w-full h-full bg-white shadow-xl flex flex-col border border-slate-200 pointer-events-none relative"
      style={{ padding: `${shellPadding}px`, paddingBottom: `${shellPadding + (hasCaption ? captionHeight + frameGap : 0)}px` }}
    >
      <div
        className="w-full h-full rounded-sm border border-slate-100"
        style={{ backgroundColor: element.fillColor }}
      />
      {hasCaption && (
        <div
          className="absolute flex items-center justify-center border-t border-slate-200/80 text-center font-extrabold uppercase text-slate-700"
          style={{
            left: shellPadding,
            right: shellPadding,
            bottom: shellPadding,
            height: captionHeight,
            fontSize: `${captionTextSize}px`,
            letterSpacing: `${Math.max(1, Math.round(captionTextSize * 0.18))}px`,
          }}
        >
          {captionText}
        </div>
      )}
    </div>
  );
}

function ShapeRenderer({ element }: { element: ShapeElement }) {
  if (element.shapeType === 'emoji') {
    return (
      <div className="w-full h-full flex items-center justify-center pointer-events-none">
        <div className="h-[84%] w-[84%]">
          <EmojiGlyph
            id={element.emojiHexcode || 'grinning-face'}
            fallback={element.emojiChar || '😀'}
            className="h-full w-full object-contain drop-shadow-[0_12px_20px_rgba(15,23,42,0.14)]"
          />
        </div>
      </div>
    );
  }

  if (element.shapeType === 'icon') {
    return (
      <div className="w-full h-full flex items-center justify-center text-[#0f172a] pointer-events-none">
        <div className="h-[84%] w-[84%]">
          <LucideIconGlyph
            name={element.iconName || 'circle'}
            className="h-full w-full drop-shadow-[0_12px_20px_rgba(15,23,42,0.16)]"
            color={element.iconColor || '#0f172a'}
            strokeWidth={element.iconStrokeWidth || 2.25}
          />
        </div>
      </div>
    );
  }

  if (element.shapeType === 'yes') {
    const baseSize = Math.min(element.width, element.height);
    const transliterationSize = Math.max(10, Math.min(18, Math.round(baseSize * 0.16)));
    const labelSize = Math.max(16, Math.min(30, Math.round(baseSize * 0.28)));
    const iconStrokeWidth = Math.max(2, Math.min(3, baseSize / 36));

    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#3b82f6] rounded-[100px] shadow-2xl text-white pointer-events-none">
        <Check className="w-1/3 h-1/3" strokeWidth={iconStrokeWidth} />
        <span style={{ fontSize: `${transliterationSize}px`, letterSpacing: `${Math.max(1, Math.round(transliterationSize * 0.12))}px`, marginTop: Math.max(4, Math.round(baseSize * 0.06)) }} className="font-semibold">NAAM</span>
        <span style={{ fontSize: `${labelSize}px`, marginTop: Math.max(2, Math.round(baseSize * 0.03)) }} className="font-bold">YES</span>
      </div>
    );
  }

  if (element.shapeType === 'no') {
    const baseSize = Math.min(element.width, element.height);
    const transliterationSize = Math.max(10, Math.min(18, Math.round(baseSize * 0.16)));
    const labelSize = Math.max(16, Math.min(30, Math.round(baseSize * 0.28)));
    const iconStrokeWidth = Math.max(2, Math.min(3, baseSize / 36));

    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#ef4444] rounded-[100px] shadow-2xl text-white pointer-events-none">
        <X className="w-1/3 h-1/3" strokeWidth={iconStrokeWidth} />
        <span style={{ fontSize: `${transliterationSize}px`, letterSpacing: `${Math.max(1, Math.round(transliterationSize * 0.12))}px`, marginTop: Math.max(4, Math.round(baseSize * 0.06)) }} className="font-semibold">LA</span>
        <span style={{ fontSize: `${labelSize}px`, marginTop: Math.max(2, Math.round(baseSize * 0.03)) }} className="font-bold">NO</span>
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
