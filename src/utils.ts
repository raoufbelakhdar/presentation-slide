import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Asset, Scene, SceneElement, SceneTemplate, TextElement } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function splitTextContent(text: string) {
  const [title = '', ...subtitleLines] = text.split('\n');

  return {
    title,
    subtitle: subtitleLines.join('\n'),
  };
}

export function combineTextContent(title: string, subtitle: string) {
  return [title.trimEnd(), subtitle.trim()].filter(Boolean).join('\n');
}

export function getTextPadding(element: Pick<TextElement, 'padding'>) {
  return Math.max(8, Math.round(element.padding || 24));
}

export function getSceneSequenceCount(scene: Scene) {
  return Math.max(scene.sequenceCount || 1, ...scene.elements.map((element) => element.revealStep), 1);
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function getSceneTemplateAssets(scene: Scene, assets: Asset[]): Asset[] {
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  const seenAssetIds = new Set<string>();
  const templateAssets: Asset[] = [];

  for (const element of scene.elements) {
    if (element.type !== 'image') continue;
    if (seenAssetIds.has(element.assetId)) continue;

    const asset = assetMap.get(element.assetId);
    if (!asset) continue;

    seenAssetIds.add(element.assetId);
    templateAssets.push(asset);
  }

  return templateAssets;
}

function renderTextElement(element: TextElement) {
  const { title, subtitle } = splitTextContent(element.text);
  const lines = [title, ...subtitle.split('\n').filter(Boolean)].filter(Boolean);
  const baseFontSize = Math.max(18, Math.round(element.fontSize));
  const subtitleFontSize = Math.max(16, Math.round(element.subtitleFontSize || element.fontSize * 0.6));
  const textPadding = getTextPadding(element);
  const innerX = element.x + textPadding;
  const innerY = element.y + textPadding;
  const innerWidth = Math.max(1, element.width - textPadding * 2);
  const innerHeight = Math.max(1, element.height - textPadding * 2);
  const subtitleLineHeight = subtitleFontSize * 1.08;
  const lineHeight = baseFontSize * 1.08;
  const totalHeight = lines.reduce((height, _, index) => {
    if (index === 0) return height + lineHeight;
    return height + subtitleLineHeight;
  }, 0);
  let currentY = innerY + innerHeight / 2 - totalHeight / 2 + lineHeight / 2;

  return `
    <rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="${Math.min(element.height / 2, 64)}" fill="#3b82f6" />
    ${lines.map((line, index) => {
      const isHeadline = index === 0;
      const fontSize = isHeadline ? baseFontSize : subtitleFontSize;
      const fontWeight = isHeadline ? element.fontWeight : 'normal';
      const opacity = isHeadline ? 1 : 0.9;
      const y = currentY;
      currentY += isHeadline ? lineHeight : subtitleLineHeight;

      return `
        <text
          x="${innerX + innerWidth / 2}"
          y="${y}"
          fill="${escapeXml(element.color)}"
          font-size="${fontSize}"
          font-weight="${fontWeight}"
          text-anchor="middle"
          dominant-baseline="middle"
          opacity="${opacity}"
          font-family="Arial, sans-serif"
        >${escapeXml(line)}</text>
      `;
    }).join('')}
  `;
}

function renderShapeElement(element: Extract<SceneElement, { type: 'shape' }>) {
  const label = element.shapeType === 'yes' ? 'YES' : 'NO';
  const transliteration = element.shapeType === 'yes' ? 'NAAM' : 'LA';
  const fill = element.shapeType === 'yes' ? '#3b82f6' : '#ef4444';
  const transliterationSize = Math.max(18, Math.round(Math.min(element.width, element.height) * 0.11));
  const labelSize = Math.max(28, Math.round(Math.min(element.width, element.height) * 0.22));

  return `
    <rect
      x="${element.x}"
      y="${element.y}"
      width="${element.width}"
      height="${element.height}"
      rx="${Math.min(element.width, element.height) / 2}"
      fill="${fill}"
    />
    <text
      x="${element.x + element.width / 2}"
      y="${element.y + element.height / 2 - labelSize * 0.7}"
      fill="#ffffff"
      font-size="${transliterationSize}"
      font-weight="600"
      letter-spacing="${Math.max(1, Math.round(transliterationSize * 0.12))}"
      text-anchor="middle"
      dominant-baseline="middle"
      font-family="Arial, sans-serif"
    >${transliteration}</text>
    <text
      x="${element.x + element.width / 2}"
      y="${element.y + element.height / 2 + labelSize * 0.25}"
      fill="#ffffff"
      font-size="${labelSize}"
      font-weight="700"
      text-anchor="middle"
      dominant-baseline="middle"
      font-family="Arial, sans-serif"
    >${label}</text>
  `;
}

function renderImageElement(element: Extract<SceneElement, { type: 'image' }>, assets: Asset[]) {
  const asset = assets.find((entry) => entry.id === element.assetId);
  const captionText = element.captionText?.trim() || '';
  const framePadding = 12;
  const captionHeight = 76;
  const imageWidth = Math.max(0, element.width - framePadding * 2);
  const imageHeight = Math.max(0, element.height - framePadding * 2 - captionHeight);
  if (!asset) {
    return `
      <rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="2" />
      <text
        x="${element.x + element.width / 2}"
        y="${element.y + element.height / 2}"
        fill="#94a3b8"
        font-size="28"
        font-weight="700"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Arial, sans-serif"
      >IMAGE</text>
    `;
  }

  return `
    <rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" />
    <image
      href="${asset.dataUrl}"
      x="${element.x + framePadding}"
      y="${element.y + framePadding}"
      width="${imageWidth}"
      height="${imageHeight}"
      preserveAspectRatio="xMidYMid slice"
    />
    <line
      x1="${element.x + framePadding}"
      y1="${element.y + element.height - captionHeight + 10}"
      x2="${element.x + element.width - framePadding}"
      y2="${element.y + element.height - captionHeight + 10}"
      stroke="#cbd5e1"
      stroke-width="2"
      opacity="0.75"
    />
    <text
      x="${element.x + element.width / 2}"
      y="${element.y + element.height - captionHeight / 2 + 8}"
      fill="#475569"
      font-size="${Math.max(24, Math.round(Math.min(element.width, element.height) * 0.09))}"
      font-weight="800"
      letter-spacing="2"
      text-anchor="middle"
      dominant-baseline="middle"
      font-family="Arial, sans-serif"
    >${escapeXml(captionText)}</text>
  `;
}

export function createSceneThumbnail(scene: Scene, assets: Asset[]): string {
  const svgContent = scene.elements.map((element) => {
    if (element.type === 'text') {
      return renderTextElement(element);
    }
    if (element.type === 'image') {
      return renderImageElement(element, assets);
    }
    return renderShapeElement(element);
  }).join('');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 1920 1080">
      <defs>
        <pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse">
          <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#e2e8f0" stroke-width="1" />
        </pattern>
      </defs>
      <rect width="1920" height="1080" fill="#ffffff" />
      <rect width="1920" height="1080" fill="url(#grid)" opacity="0.7" />
      <rect x="24" y="24" width="1872" height="1032" fill="none" stroke="#cbd5e1" stroke-width="8" rx="16" />
      ${svgContent || `
        <text
          x="960"
          y="540"
          fill="#cbd5e1"
          font-size="88"
          font-weight="700"
          text-anchor="middle"
          dominant-baseline="middle"
          font-family="Arial, sans-serif"
        >Empty Template</text>
      `}
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildSceneTemplate(scene: Scene, assets: Asset[], name: string, existingTemplate?: Partial<SceneTemplate>): SceneTemplate {
  const bundledAssets = getSceneTemplateAssets(scene, assets).map((asset) => ({ ...asset }));
  const sceneCopy: Scene = {
    ...scene,
    id: generateId(),
    name,
    elements: scene.elements.map((element) => ({ ...element })),
    sequences: scene.sequences ? scene.sequences.map((sequence) => ({ ...sequence })) : undefined,
  };

  return {
    id: existingTemplate?.id || generateId(),
    name,
    scene: sceneCopy,
    assets: bundledAssets,
    thumbnailDataUrl: createSceneThumbnail(sceneCopy, bundledAssets),
    createdAt: existingTemplate?.createdAt,
    updatedAt: existingTemplate?.updatedAt,
  };
}

export function exportProject(project: any) {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", project.name + ".json");
  document.body.appendChild(downloadAnchorNode); // required for firefox
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}

export function getEffectiveElementState(element: any, currentStep: number) {
  const effectiveElement = { ...element };
  
  if (element.keyframes) {
    // Apply keyframes in order up to the current step
    const steps = Object.keys(element.keyframes).map(Number).sort((a, b) => a - b);
    for (const step of steps) {
      if (step <= currentStep) {
        Object.assign(effectiveElement, element.keyframes[step]);
      }
    }
  }

  // If there's a hideStep and we reached or passed it, mark as hidden
  if (element.hideStep !== undefined && element.hideStep !== null && currentStep >= element.hideStep) {
    effectiveElement.hidden = true;
  } else if (effectiveElement.hidden === undefined) {
    effectiveElement.hidden = false;
  }

  return effectiveElement;
}
