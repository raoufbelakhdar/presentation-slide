import React, { useEffect, useCallback, useState, useRef } from 'react';
import { useAppContext } from '../AppContext';
import { X, ChevronLeft, ChevronRight, Maximize, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DEFAULT_SEQUENCE_ANIMATION_TYPE, DEFAULT_SEQUENCE_DELAY, DEFAULT_SEQUENCE_DURATION, TextElement, ImageElement, ShapeElement, Scene, ColorElement } from '../types';
import { getEffectiveElementState, getTextAlign, getTextPadding, getTextSubtitleFontSize, getTextVariant, splitTextContent } from '../utils';
import { LucideIconGlyph } from './LucideIconGlyph';
import { EmojiGlyph } from './EmojiGlyph';

function getSequenceConfig(scene: Scene, step: number) {
  return scene.sequences?.find((sequence) => sequence.step === step) || {
    step,
    animationType: DEFAULT_SEQUENCE_ANIMATION_TYPE,
    duration: DEFAULT_SEQUENCE_DURATION,
    delay: DEFAULT_SEQUENCE_DELAY,
  };
}

export function PresentationView() {
  const { state, dispatch } = useAppContext();
  const { project, presentationSceneIndex, presentationRevealStep } = state;
  const [bgColor, setBgColor] = useState('#00ff00');
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentScene = project.scenes[presentationSceneIndex];
  
  const maxStepForScene = currentScene 
    ? Math.max(currentScene.sequenceCount || 1, ...currentScene.elements.map(e => e.revealStep), 1)
    : 0;

  const exitPresentation = () => {
    dispatch({ type: 'SET_MODE', payload: 'editor' });
  };

  const handleNext = useCallback(() => {
    if (presentationRevealStep < maxStepForScene) {
      dispatch({ type: 'SET_PRESENTATION_STEP', payload: presentationRevealStep + 1 });
    } else if (presentationSceneIndex < project.scenes.length - 1) {
      dispatch({ type: 'SET_PRESENTATION_SCENE', payload: presentationSceneIndex + 1 });
      dispatch({ type: 'SET_PRESENTATION_STEP', payload: 1 });
    }
  }, [presentationRevealStep, maxStepForScene, presentationSceneIndex, project.scenes.length, dispatch]);

  const handlePrev = useCallback(() => {
    if (presentationRevealStep > 1) {
      dispatch({ type: 'SET_PRESENTATION_STEP', payload: presentationRevealStep - 1 });
    } else if (presentationSceneIndex > 0) {
      const prevScene = project.scenes[presentationSceneIndex - 1];
      const prevMaxStep = Math.max(prevScene.sequenceCount || 1, ...prevScene.elements.map(e => e.revealStep), 1);
      dispatch({ type: 'SET_PRESENTATION_SCENE', payload: presentationSceneIndex - 1 });
      dispatch({ type: 'SET_PRESENTATION_STEP', payload: prevMaxStep });
    }
  }, [presentationRevealStep, presentationSceneIndex, project.scenes, dispatch]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitPresentation();
      else if (e.key === 'ArrowRight' || e.key === ' ') handleNext();
      else if (e.key === 'ArrowLeft') handlePrev();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev]);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const availableWidth = containerRef.current.clientWidth;
        const availableHeight = containerRef.current.clientHeight;
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

  if (!currentScene) return null;

  const orderedElements = [...currentScene.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden text-white"
      style={{ backgroundColor: bgColor }}
    >
      {/* Header / Controls overlay */}
      <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between opacity-0 hover:opacity-100 transition-opacity bg-gradient-to-b from-black/60 to-transparent z-50">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-lg">{project.name}</span>
          <span className="text-white/60 text-sm">|</span>
          <span className="text-white/80">{currentScene.name}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="bg-black/40 rounded-full px-3 py-1 flex items-center gap-1.5 text-sm font-medium mr-4 backdrop-blur-md">
            <span>Scene {presentationSceneIndex + 1}/{project.scenes.length}</span>
            <span className="text-white/40">•</span>
            <span>Sequence {presentationRevealStep}/{maxStepForScene || 1}</span>
          </div>
          
          <button onClick={exitPresentation} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors backdrop-blur-md" title="Exit Presentation (Esc)">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div ref={containerRef} className="flex-1 relative flex items-center justify-center overflow-hidden" onClick={handleNext}>
        <div 
          className="relative overflow-hidden shrink-0 cursor-pointer"
          style={{
            width: '1920px',
            height: '1080px',
            backgroundColor: bgColor,
            transform: `scale(${scale})`,
            transformOrigin: 'center center'
          }}
        >
          <AnimatePresence>
            {orderedElements
              .map(element => {
                if (element.revealStep > presentationRevealStep) return null;

                const effectiveElement = getEffectiveElementState(element, presentationRevealStep);
                if (effectiveElement.hidden) return null;

                const hasCurrentStepKeyframe = Boolean(
                  element.keyframes?.[presentationRevealStep] &&
                  element.revealStep < presentationRevealStep,
                );
                const isCurrentStep = element.revealStep === presentationRevealStep;
                const animatesThisStep = isCurrentStep || hasCurrentStepKeyframe;
                const config = getSequenceConfig(
                  currentScene,
                  animatesThisStep ? presentationRevealStep : element.revealStep,
                );
                
                let initial: any = { opacity: 0 };
                let animate: any = { 
                  opacity: 1,
                  left: effectiveElement.x,
                  top: effectiveElement.y,
                  width: effectiveElement.width,
                  height: effectiveElement.height,
                };
                
                if (config.animationType === 'slide-up') {
                  initial = { opacity: 0, y: 50 };
                  animate.y = 0;
                } else if (config.animationType === 'slide-left') {
                  initial = { opacity: 0, x: 50 };
                  animate.x = 0;
                } else if (config.animationType === 'scale') {
                  initial = { opacity: 0, scale: 0.9 };
                  animate.scale = 1;
                } else if (config.animationType === 'none') {
                  initial = { opacity: 1 };
                }

                if (isCurrentStep) {
                  initial = { 
                    ...initial, 
                    left: effectiveElement.x,
                    top: effectiveElement.y,
                    width: effectiveElement.width,
                    height: effectiveElement.height,
                  };
                }

                return (
                  <motion.div
                    key={element.id}
                    layout
                    initial={isCurrentStep ? initial : false}
                    animate={animate}
                    exit={{ opacity: 0, y: 60 }}
                    transition={{ 
                      duration: animatesThisStep ? config.duration : 0.6, 
                      delay: animatesThisStep ? config.delay : 0, 
                      ease: [0.16, 1, 0.3, 1] // Custom spring-like easing
                    }}
                    className="absolute"
                    style={{ zIndex: effectiveElement.zIndex ?? 0 }}
                  >
                  {effectiveElement.type === 'text' && (
                    (() => {
                      const textElement = effectiveElement as TextElement;
                      const textVariant = getTextVariant(textElement);
                      const textAlign = getTextAlign(textElement);
                      const { title, subtitle } = splitTextContent(textElement.text);
                      const subtitleLines = subtitle.split('\n').filter(Boolean);
                      const subtitleFontSize = getTextSubtitleFontSize(textElement);
                      const textPadding = textVariant === 'block' ? getTextPadding(textElement) : 0;
                      const blockTextPaddingX = Math.max(8, Math.round(textPadding * 0.72));

                      return (
                        <div 
                          className={`w-full h-full pointer-events-none ${
                            textVariant === 'block'
                              ? 'flex flex-col items-center justify-center text-center shadow-2xl rounded-[100px]'
                              : 'flex flex-col items-start justify-start text-left'
                          }`}
                          style={{
                            backgroundColor: textVariant === 'block' ? '#3b82f6' : 'transparent',
                            color: textElement.color,
                            padding: textVariant === 'block' ? `${textPadding}px ${blockTextPaddingX}px` : '0px',
                          }}
                        >
                          {textVariant === 'block' ? (
                            <div className="w-full h-full flex flex-col justify-center" style={{ textAlign }}>
                              <div style={{ 
                                fontSize: `${textElement.fontSize}px`,
                                fontWeight: textElement.fontWeight,
                                opacity: 1,
                                lineHeight: 1.1,
                              }}>
                                {title}
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
                          ) : (
                            <div
                              className="w-full whitespace-pre-wrap break-words"
                              style={{
                                fontSize: `${textElement.fontSize}px`,
                                fontWeight: textElement.fontWeight,
                                lineHeight: 1.12,
                                textAlign,
                              }}
                            >
                              {textElement.text}
                            </div>
                          )}
                        </div>
                      );
                    })()
                  )}

                  {effectiveElement.type === 'image' && (
                    <PresentationImage element={effectiveElement as ImageElement} />
                  )}

                  {effectiveElement.type === 'color' && (
                    <PresentationColorCard element={effectiveElement as ColorElement} />
                  )}

                  {effectiveElement.type === 'shape' && (
                    <PresentationShape element={effectiveElement as ShapeElement} />
                  )}
                </motion.div>
                );
              })}
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation Overlays */}
      <div className="absolute inset-y-0 left-0 w-32 flex items-center justify-start p-4 opacity-0 hover:opacity-100 transition-opacity z-40" onClick={(e) => { e.stopPropagation(); handlePrev(); }}>
        <button className="p-3 bg-black/50 hover:bg-black/70 rounded-full text-white backdrop-blur-md disabled:opacity-30 disabled:cursor-not-allowed" disabled={presentationSceneIndex === 0 && presentationRevealStep === 1}>
          <ChevronLeft className="w-8 h-8" />
        </button>
      </div>
      
      <div className="absolute inset-y-0 right-0 w-32 flex items-center justify-end p-4 opacity-0 hover:opacity-100 transition-opacity z-40" onClick={(e) => { e.stopPropagation(); handleNext(); }}>
        <button className="p-3 bg-black/50 hover:bg-black/70 rounded-full text-white backdrop-blur-md disabled:opacity-30 disabled:cursor-not-allowed" disabled={presentationSceneIndex === project.scenes.length - 1 && presentationRevealStep === maxStepForScene}>
          <ChevronRight className="w-8 h-8" />
        </button>
      </div>

      {/* Background Color HUD */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity z-50">
        <div className="flex bg-black/40 rounded-full px-3 py-2 gap-3 backdrop-blur-md items-center">
           <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider pl-2 pr-1">Chroma Key</span>
           <button onClick={(e) => { e.stopPropagation(); setBgColor('#00ff00'); }} className={`w-6 h-6 rounded-full bg-[#00ff00] border-2 transition-all ${bgColor === '#00ff00' ? 'border-white scale-110' : 'border-transparent'}`} title="Green Screen"></button>
           <button onClick={(e) => { e.stopPropagation(); setBgColor('#0000ff'); }} className={`w-6 h-6 rounded-full bg-[#0000ff] border-2 transition-all ${bgColor === '#0000ff' ? 'border-white scale-110' : 'border-transparent'}`} title="Blue Screen"></button>
           <button onClick={(e) => { e.stopPropagation(); setBgColor('#ffffff'); }} className={`w-6 h-6 rounded-full bg-white border-2 transition-all ${bgColor === '#ffffff' ? 'border-slate-300 scale-110' : 'border-transparent'}`} title="White Screen"></button>
           <button onClick={(e) => { e.stopPropagation(); setBgColor('#000000'); }} className={`w-6 h-6 rounded-full bg-black border-2 transition-all ${bgColor === '#000000' ? 'border-white scale-110' : 'border-white/20'}`} title="Black Screen"></button>
        </div>
      </div>
    </div>
  );
}

function PresentationImage({ element }: { element: ImageElement }) {
  const { state } = useAppContext();
  const asset = state.project.assets.find(a => a.id === element.assetId);
  const captionText = element.captionText?.trim() || '';

  if (!asset) return null;

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

function PresentationColorCard({ element }: { element: ColorElement }) {
  const captionText = element.captionText?.trim() || '';

  return (
    <div
      className="w-full h-full bg-white p-3 shadow-xl flex flex-col border border-slate-200 pointer-events-none relative"
      style={{ paddingBottom: '4.5rem' }}
    >
      <div
        className="w-full h-full rounded-sm border border-slate-100"
        style={{ backgroundColor: element.fillColor }}
      />
      <div className="absolute inset-x-3 bottom-3 flex h-11 items-center justify-center border-t border-slate-200/80 text-center text-[14px] font-extrabold uppercase tracking-[0.2em] text-slate-700">
        {captionText}
      </div>
    </div>
  );
}

function PresentationShape({ element }: { element: ShapeElement }) {
  if (element.shapeType === 'emoji') {
    return (
      <div className="w-full h-full flex items-center justify-center pointer-events-none">
        <div className="h-[84%] w-[84%]">
          <EmojiGlyph
            id={element.emojiHexcode || 'grinning-face'}
            fallback={element.emojiChar || '😀'}
            className="h-full w-full object-contain drop-shadow-[0_18px_32px_rgba(15,23,42,0.16)]"
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
            className="h-full w-full drop-shadow-[0_18px_32px_rgba(15,23,42,0.18)]"
            color={element.iconColor || '#0f172a'}
            strokeWidth={element.iconStrokeWidth || 2.25}
          />
        </div>
      </div>
    );
  }

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
        <Check className="h-full w-full drop-shadow-[0_18px_32px_rgba(14,165,233,0.3)]" strokeWidth={4} />
      </div>
    );
  }

  if (element.shapeType === 'cross') {
    return (
      <div className="w-full h-full flex items-center justify-center text-[#ef4444] pointer-events-none">
        <X className="h-full w-full drop-shadow-[0_18px_32px_rgba(239,68,68,0.3)]" strokeWidth={4} />
      </div>
    );
  }

  return null;
}
