export type ElementType = 'image' | 'text' | 'shape';

export type AnimationType = 'fade' | 'slide-up' | 'slide-left' | 'scale' | 'none';

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
  text: string;
  fontSize: number;
  subtitleFontSize?: number;
  padding?: number;
  fontWeight: 'normal' | 'bold' | 'lighter' | 'bolder';
  color: string;
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shapeType: 'yes' | 'no';
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
