export type ElementType = 'image' | 'text' | 'shape';

export type AnimationType = 'fade' | 'slide-up' | 'slide-left' | 'scale' | 'none';

export const DEFAULT_SEQUENCE_ANIMATION_TYPE: AnimationType = 'slide-up';
export const DEFAULT_SEQUENCE_DURATION = 0.85;
export const DEFAULT_SEQUENCE_DELAY = 0.08;

export interface SequenceConfig {
  step: number;
  animationType: AnimationType;
  duration: number;
  delay: number;
}

export interface ElementKeyframe {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  hidden?: boolean;
}

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
  revealStep: number;
  hideStep?: number | null;
  keyframes?: Record<number, ElementKeyframe>;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  assetId: string;
  captionText?: string;
}

export interface TextElement extends BaseElement {
  type: 'text';
  variant?: 'block' | 'free';
  text: string;
  fontSize: number;
  subtitleFontSize?: number;
  padding?: number;
  fontWeight: 'normal' | 'bold' | 'lighter' | 'bolder';
  color: string;
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shapeType: 'yes' | 'no' | 'check' | 'cross';
}

export type SceneElement = ImageElement | TextElement | ShapeElement;

export interface Scene {
  id: string;
  name: string;
  elements: SceneElement[];
  sequenceCount?: number;
  sequences?: SequenceConfig[];
}

export interface Asset {
  id: string;
  name: string;
  dataUrl: string;
}

export interface SceneTemplate {
  id: string;
  name: string;
  kind?: 'scene' | 'branch';
  scene: Scene;
  assets: Asset[];
  thumbnailDataUrl: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  scenes: Scene[];
  assets: Asset[];
  templates: Scene[];
  createdAt?: string;
  updatedAt?: string;
}

export type AppMode = 'editor' | 'presentation';
export type AppScreen = 'projects' | 'editor';
