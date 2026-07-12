const PEXELS_API_BASE_URL = 'https://api.pexels.com/v1';

const RAW_PEXELS_API_KEY = import.meta.env.VITE_PEXELS_API_KEY?.trim() || '';

export const PEXELS_API_KEY = RAW_PEXELS_API_KEY;
export const PEXELS_IS_CONFIGURED = RAW_PEXELS_API_KEY.length > 0;

export type PexelsOrientation = 'all' | 'landscape' | 'portrait' | 'square';
export type PexelsSize = 'all' | 'large' | 'medium' | 'small';
export type PexelsColor =
  | 'all'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'turquoise'
  | 'blue'
  | 'violet'
  | 'pink'
  | 'brown'
  | 'black'
  | 'gray'
  | 'white';

export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  alt: string;
  avg_color: string | null;
  photographer: string;
  photographer_url: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
}

interface PexelsPhotoResponse {
  page: number;
  per_page: number;
  photos: PexelsPhoto[];
  total_results: number;
  next_page?: string;
}

export interface PexelsSearchOptions {
  query: string;
  page?: number;
  perPage?: number;
  orientation?: PexelsOrientation;
  size?: PexelsSize;
  color?: PexelsColor;
  signal?: AbortSignal;
}

export interface PexelsResultPage {
  photos: PexelsPhoto[];
  page: number;
  totalResults: number;
  hasNextPage: boolean;
}

function createHeaders() {
  return {
    Authorization: PEXELS_API_KEY,
  };
}

function buildSearchParams(options: PexelsSearchOptions) {
  const params = new URLSearchParams();
  params.set('page', String(options.page ?? 1));
  params.set('per_page', String(options.perPage ?? 18));

  if (options.orientation && options.orientation !== 'all') {
    params.set('orientation', options.orientation);
  }
  if (options.size && options.size !== 'all') {
    params.set('size', options.size);
  }
  if (options.color && options.color !== 'all') {
    params.set('color', options.color);
  }

  return params;
}

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    headers: createHeaders(),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Pexels request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function searchPexelsPhotos(options: PexelsSearchOptions): Promise<PexelsResultPage> {
  if (!PEXELS_IS_CONFIGURED) {
    throw new Error('Missing VITE_PEXELS_API_KEY');
  }

  const trimmedQuery = options.query.trim();
  const params = buildSearchParams(options);
  const endpoint = trimmedQuery
    ? `${PEXELS_API_BASE_URL}/search?query=${encodeURIComponent(trimmedQuery)}&${params.toString()}`
    : `${PEXELS_API_BASE_URL}/curated?${params.toString()}`;
  const data = await requestJson<PexelsPhotoResponse>(endpoint, options.signal);

  return {
    photos: data.photos || [],
    page: data.page,
    totalResults: data.total_results,
    hasNextPage: Boolean(data.next_page) || data.page * data.per_page < data.total_results,
  };
}

export function buildPexelsImageUrl(baseUrl: string, width: number, height: number) {
  const url = new URL(baseUrl);
  url.searchParams.set('auto', 'compress');
  url.searchParams.set('cs', 'tinysrgb');
  url.searchParams.set('fit', 'crop');
  url.searchParams.set('w', String(width));
  url.searchParams.set('h', String(height));
  url.searchParams.set('dpr', '1');
  return url.toString();
}

export function getPexelsThumbnailUrl(photo: PexelsPhoto) {
  return buildPexelsImageUrl(photo.src.medium || photo.src.small || photo.src.tiny, 240, 240);
}

export function getPexelsAssetUrl(photo: PexelsPhoto) {
  return buildPexelsImageUrl(photo.src.large || photo.src.medium || photo.src.small, 960, 960);
}

export async function convertRemoteImageToDataUrl(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Image download failed with status ${response.status}`);
  }

  const blob = await response.blob();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('Failed to convert image to data URL'));
    reader.readAsDataURL(blob);
  });
}

export function getPexelsPhotoLabel(photo: PexelsPhoto) {
  const title = photo.alt?.trim() || `Pexels photo ${photo.id}`;
  return `${title} - ${photo.photographer}`.slice(0, 120);
}
