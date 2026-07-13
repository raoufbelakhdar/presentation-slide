import { Asset, AssetKind, ImageFrameStyle } from './types';

function isSvgAssetName(name: string) {
  return /\.svg$/i.test(name);
}

function isSvgDataUrl(dataUrl: string) {
  return dataUrl.startsWith('data:image/svg+xml');
}

function isPngFile(file: File) {
  return file.type === 'image/png' || /\.png$/i.test(file.name);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        resolve(event.target.result);
        return;
      }

      reject(new Error(`Could not read ${file.name}.`));
    };

    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function hasTransparentPixels(dataUrl: string) {
  return new Promise<boolean>((resolve) => {
    const image = new Image();

    image.onload = () => {
      try {
        const width = Math.max(1, Math.min(256, image.naturalWidth || image.width || 1));
        const height = Math.max(1, Math.min(256, image.naturalHeight || image.height || 1));
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });

        if (!context) {
          resolve(false);
          return;
        }

        canvas.width = width;
        canvas.height = height;
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        const { data } = context.getImageData(0, 0, width, height);

        for (let index = 3; index < data.length; index += 4) {
          if (data[index] < 255) {
            resolve(true);
            return;
          }
        }

        resolve(false);
      } catch {
        resolve(false);
      }
    };

    image.onerror = () => resolve(false);
    image.src = dataUrl;
  });
}

export function getAssetKind(asset: Pick<Asset, 'kind' | 'name' | 'dataUrl'>): AssetKind {
  if (asset.kind === 'graphic' || asset.kind === 'photo') {
    return asset.kind;
  }

  if (isSvgDataUrl(asset.dataUrl) || isSvgAssetName(asset.name)) {
    return 'graphic';
  }

  return 'photo';
}

export function getDefaultImageFrameStyle(asset?: Pick<Asset, 'kind' | 'name' | 'dataUrl'> | null): ImageFrameStyle {
  return asset && getAssetKind(asset) === 'graphic' ? 'plain' : 'polaroid';
}

export async function createAssetFromFile(file: File): Promise<Asset> {
  const dataUrl = await readFileAsDataUrl(file);
  let kind: AssetKind = 'photo';

  if (file.type === 'image/svg+xml' || isSvgAssetName(file.name)) {
    kind = 'graphic';
  } else if (isPngFile(file) && await hasTransparentPixels(dataUrl)) {
    kind = 'graphic';
  }

  return {
    id: Math.random().toString(36).substring(2, 9),
    name: file.name,
    dataUrl,
    kind,
  };
}
