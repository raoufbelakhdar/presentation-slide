import React, { useDeferredValue, useEffect, useState } from "react";
import { useAppContext } from "../AppContext";
import {
  Upload,
  Save,
  Copy,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  GitBranch,
  Search,
  Star,
  Layers,
  Image,
  Smile,
  Lightbulb,
  Loader2,
  LayoutGrid,
  Shapes,
  TextCursorInput,
  WifiOff,
  BookOpen,
} from "lucide-react";
import {
  Asset,
  DictionaryEntry,
  FavoriteComponent,
  FavoritePresetId,
  SceneElement,
  SavedComponent,
  TextElement,
  ImageElement,
  ShapeElement,
  ColorElement,
} from "../types";
import {
  createAssetFromFile,
  getAssetKind,
  getDefaultImageFrameStyle,
} from "../assetUtils";
import {
  buildSceneTemplate,
  generateId,
  getTextAlign,
  getTextSubtitleFontSize,
  getTextVariant,
  mergeAssetLibraries,
  splitTextContent,
} from "../utils";
import { getDictionarySearchText, parseDictionaryJson } from "../dictionary";
import {
  DEFAULT_ICON_COLOR,
  FEATURED_ICON_NAMES,
  LUCIDE_ICON_NAMES,
  formatIconName,
  searchLucideIcons,
} from "../iconLibrary";
import { LucideIconGlyph } from "./LucideIconGlyph";
import {
  FEATURED_EMOJI_IDS,
  getEmojiById,
  getEmojiLabel,
  searchEmojis,
} from "../emojiLibrary";
import { EmojiGlyph } from "./EmojiGlyph";
import {
  convertRemoteImageToDataUrl,
  getPexelsAssetUrl,
  getPexelsPhotoLabel,
  getPexelsThumbnailUrl,
  PEXELS_IS_CONFIGURED,
  PexelsColor,
  PexelsOrientation,
  PexelsPhoto,
  PexelsSize,
  searchPexelsPhotos,
} from "../pexels";

const DICTIONARY_JSON_TEMPLATE = `{
  "words": [
    {
      "arabicWord": "كتب",
      "phonetic": "kataba",
      "pronunciation": "ka-ta-ba"
    },
    {
      "arabicWord": "مدرسة",
      "phonetic": "madrasa",
      "pronunciation": "mad-ra-sa"
    }
  ]
}`;

const EMPTY_MANUAL_DICTIONARY_ENTRY = {
  arabicWord: "",
  phonetic: "",
  pronunciation: "",
};

const PEXELS_ORIENTATION_OPTIONS: Array<{
  value: PexelsOrientation;
  label: string;
}> = [
  { value: "all", label: "Any shape" },
  { value: "landscape", label: "Landscape" },
  { value: "portrait", label: "Portrait" },
  { value: "square", label: "Square" },
];

const PEXELS_SIZE_OPTIONS: Array<{ value: PexelsSize; label: string }> = [
  { value: "all", label: "Any size" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

const PEXELS_COLOR_OPTIONS: Array<{ value: PexelsColor; label: string }> = [
  { value: "all", label: "Any color" },
  { value: "white", label: "White" },
  { value: "gray", label: "Gray" },
  { value: "black", label: "Black" },
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
  { value: "yellow", label: "Yellow" },
  { value: "orange", label: "Orange" },
  { value: "red", label: "Red" },
  { value: "pink", label: "Pink" },
  { value: "violet", label: "Violet" },
  { value: "brown", label: "Brown" },
  { value: "turquoise", label: "Turquoise" },
];

type PresetId = FavoritePresetId;
const SHARED_ASSETS_VISIBILITY_STORAGE_KEY =
  "visual-learning-shared-assets-visible";
const COMPONENT_THUMBNAIL_BACKGROUND_CLASS =
  "bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_52%,#334155_100%)]";
const SAVED_COMPONENT_TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All", icon: LayoutGrid },
  { value: "image", label: "Images", icon: Image },
  { value: "text-block", label: "Text Block", icon: TextCursorInput },
  { value: "icon", label: "Icons", icon: Shapes },
  { value: "emoji", label: "Emoji", icon: Smile },
] as const;
type SavedComponentTypeFilter =
  (typeof SAVED_COMPONENT_TYPE_FILTER_OPTIONS)[number]["value"];

function matchesSearchQuery(
  query: string,
  ...values: Array<string | null | undefined>
) {
  if (!query) return true;

  return values.some((value) => value?.toLowerCase().includes(query));
}

function cloneFavoriteElement(element: SceneElement): SceneElement {
  return {
    ...element,
    keyframes: element.keyframes
      ? Object.fromEntries(
          Object.entries(element.keyframes).map(([step, keyframe]) => [
            Number(step),
            { ...keyframe },
          ]),
        )
      : undefined,
  } as SceneElement;
}

function getSavedFavoriteTypeLabel(element: SceneElement) {
  if (element.type === "text") {
    return getTextVariant(element) === "free" ? "Text" : "Text Block";
  }

  if (element.type === "image") return "Image";
  if (element.type === "color") return "Color";
  if (element.shapeType === "emoji") return "Emoji";
  if (element.shapeType === "icon") return "Icon";
  if (element.shapeType === "yes") return "Yes";
  if (element.shapeType === "no") return "No";
  if (element.shapeType === "check") return "Check";
  return "Cross";
}

function getSavedFavoriteTypeFilterValue(
  element: SceneElement,
): SavedComponentTypeFilter {
  if (element.type === "text") {
    return "text-block";
  }

  if (element.type === "image") return "image";
  if (element.type === "color") return "all";
  if (element.shapeType === "emoji") return "emoji";
  return "icon";
}

function getSavedComponentSearchText(favorite: SavedComponent) {
  const searchParts = [favorite.name, getSavedFavoriteTypeLabel(favorite.element)];
  const { element } = favorite;

  if (element.type === "text") {
    searchParts.push(element.text);
  }

  if (element.type === "image") {
    searchParts.push(favorite.asset?.name);
  }

  if (element.type === "shape") {
    if (element.shapeType === "icon") {
      searchParts.push(
        element.iconName,
        formatIconName(element.iconName || ""),
      );
    }

    if (element.shapeType === "emoji") {
      const emojiEntry = getEmojiById(element.emojiHexcode || "");
      searchParts.push(
        element.emojiChar,
        element.emojiHexcode,
        emojiEntry ? getEmojiLabel(emojiEntry) : undefined,
      );
    }
  }

  return searchParts.filter(Boolean).join(" ").toLowerCase();
}

function SavedElementFavoritePreview({
  favorite,
}: {
  favorite: Extract<FavoriteComponent, { type: "saved-element" }>;
}) {
  const { element, asset } = favorite;

  if (element.type === "text") {
    const textVariant = getTextVariant(element);
    const textAlign = getTextAlign(element);
    const textParts = splitTextContent(element.text);
    const title =
      textVariant === "free"
        ? element.text
            .split("\n")
            .find((line) => line.trim())
            ?.trim() || "Add your text here"
        : textParts.title.trim() || "Main Title";
    const subtitleLines =
      textVariant === "block"
        ? textParts.subtitle.split("\n").filter(Boolean).slice(0, 2)
        : [];

    return (
      <div
        className={`flex h-20 w-full items-center justify-center overflow-hidden rounded-md border border-[#dbe4f0] p-2.5 ${COMPONENT_THUMBNAIL_BACKGROUND_CLASS}`}
      >
        {textVariant === "block" ? (
          <div
            className="flex h-full w-full flex-col justify-center rounded-[24px] bg-[#3b82f6] px-3 text-white"
            style={{ textAlign }}
          >
            <div
              className="truncate text-[11px] font-bold leading-tight"
              style={{ fontSize: Math.min(11, Math.max(8, element.fontSize / 6)) }}
            >
              {title}
            </div>
            {subtitleLines.map((line, index) => (
              <div
                key={`${favorite.id}-${index}`}
                className="truncate opacity-90"
                style={{
                  fontSize: `${Math.min(
                    9,
                    Math.max(7, getTextSubtitleFontSize(element) / 5),
                  )}px`,
                }}
              >
                {line}
              </div>
            ))}
          </div>
        ) : (
          <div
            className="w-full whitespace-pre-wrap break-words text-[11px] font-bold leading-tight text-slate-800"
            style={{
              textAlign,
              color: element.color,
              fontWeight: element.fontWeight,
              fontSize: `${Math.min(12, Math.max(8, element.fontSize / 5.5))}px`,
            }}
          >
            {title}
          </div>
        )}
      </div>
    );
  }

  if (element.type === "image") {
    return (
      <div
        className={`flex h-20 w-full items-center justify-center overflow-hidden rounded-md border border-[#dbe4f0] ${COMPONENT_THUMBNAIL_BACKGROUND_CLASS}`}
      >
        {asset ? (
          <img
            src={asset.dataUrl}
            alt={favorite.name}
            className={`h-full w-full ${
              getAssetKind(asset) === "graphic"
                ? "object-contain p-2"
                : "object-cover"
            }`}
          />
        ) : (
          <div className="px-3 text-center text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Missing image asset
          </div>
        )}
      </div>
    );
  }

  if (element.type === "color") {
    return (
      <div
        className={`flex h-20 w-full items-center justify-center rounded-md border border-[#dbe4f0] p-3 ${COMPONENT_THUMBNAIL_BACKGROUND_CLASS}`}
      >
        <div
          className="h-full w-full rounded-sm border border-slate-100 shadow-sm"
          style={{ backgroundColor: element.fillColor }}
        />
      </div>
    );
  }

  if (element.shapeType === "emoji") {
    const emojiEntry = getEmojiById(element.emojiHexcode || "");
    return (
      <div
        className={`flex h-20 w-full items-center justify-center rounded-md border border-[#dbe4f0] ${COMPONENT_THUMBNAIL_BACKGROUND_CLASS}`}
      >
        <EmojiGlyph
          id={element.emojiHexcode || "grinning-face"}
          fallback={emojiEntry?.emoji || element.emojiChar || "😀"}
          className="h-12 w-12 text-5xl"
        />
      </div>
    );
  }

  if (element.shapeType === "icon") {
    return (
      <div
        className={`flex h-20 w-full items-center justify-center rounded-md border border-[#dbe4f0] p-4 ${COMPONENT_THUMBNAIL_BACKGROUND_CLASS}`}
      >
        <LucideIconGlyph
          name={element.iconName || "circle"}
          className="h-full w-full"
          color={element.iconColor || DEFAULT_ICON_COLOR}
          strokeWidth={element.iconStrokeWidth || 2.25}
        />
      </div>
    );
  }

  if (element.shapeType === "yes" || element.shapeType === "no") {
    return (
      <div
        className={`flex h-20 w-full items-center justify-center rounded-md border border-[#dbe4f0] ${COMPONENT_THUMBNAIL_BACKGROUND_CLASS}`}
      >
        <BadgePresetPreview type={element.shapeType} />
      </div>
    );
  }

  return (
    <div
      className={`flex h-20 w-full items-center justify-center rounded-md border border-[#dbe4f0] ${COMPONENT_THUMBNAIL_BACKGROUND_CLASS}`}
    >
      <MarkPresetPreview
        type={element.shapeType === "check" ? "check" : "cross"}
      />
    </div>
  );
}

function TextPresetPreview({ block = false }: { block?: boolean }) {
  return (
    <div
      className={`flex h-12 w-16 shrink-0 overflow-hidden rounded-md border border-[#dbe4f0] ${
        block
          ? `items-center justify-center ${COMPONENT_THUMBNAIL_BACKGROUND_CLASS}`
          : `items-start justify-start p-2.5 ${COMPONENT_THUMBNAIL_BACKGROUND_CLASS}`
      }`}
    >
      {block ? (
        <div className="flex h-7 w-11 flex-col items-center justify-center rounded-full bg-[#3b82f6] px-2">
          <span className="h-1.5 w-6 rounded-full bg-white" />
          <span className="mt-1 h-1 w-4 rounded-full bg-white/85" />
        </div>
      ) : (
        <div className="w-full space-y-1">
          <div className="h-1.5 w-10 rounded-full bg-slate-700" />
          <div className="h-1.5 w-7 rounded-full bg-slate-400" />
          <div className="h-1.5 w-11 rounded-full bg-slate-300" />
          <div className="h-1.5 w-6 rounded-full bg-slate-200" />
        </div>
      )}
    </div>
  );
}

function BadgePresetPreview({ type }: { type: "yes" | "no" }) {
  const isYes = type === "yes";

  return (
    <div
      className={`flex h-12 w-16 shrink-0 items-center justify-center rounded-md border border-[#dbe4f0] ${COMPONENT_THUMBNAIL_BACKGROUND_CLASS}`}
    >
      <div
        className={`flex h-10 w-10 flex-col items-center justify-center rounded-full text-white shadow-sm ${
          isYes ? "bg-[#3b82f6]" : "bg-[#ef4444]"
        }`}
      >
        <span className="text-[4px] font-semibold uppercase tracking-[0.16em]">
          {isYes ? "NAAM" : "LA"}
        </span>
        <span className="mt-0.5 text-[6px] font-black uppercase">
          {isYes ? "YES" : "NO"}
        </span>
      </div>
    </div>
  );
}

function MarkPresetPreview({ type }: { type: "check" | "cross" }) {
  return (
    <div
      className={`flex h-12 w-16 shrink-0 items-center justify-center rounded-md border border-[#dbe4f0] ${COMPONENT_THUMBNAIL_BACKGROUND_CLASS}`}
    >
      {type === "check" ? (
        <Check className="h-8 w-8 text-sky-500" strokeWidth={3.5} />
      ) : (
        <X className="h-8 w-8 text-rose-500" strokeWidth={3.5} />
      )}
    </div>
  );
}

function ColorCardPresetPreview() {
  return (
    <div
      className={`flex h-12 w-16 shrink-0 items-center justify-center rounded-md border border-[#dbe4f0] ${COMPONENT_THUMBNAIL_BACKGROUND_CLASS}`}
    >
      <div className="relative h-10 w-10 rounded-[3px] bg-[#f59e0b] shadow-sm">
        <div className="absolute inset-x-1.5 bottom-1.5 h-1 rounded-full bg-white/80" />
      </div>
    </div>
  );
}

function IconPresetPreview({ iconName }: { iconName: string }) {
  return (
    <div
      className={`flex h-10 w-12 shrink-0 items-center justify-center rounded-md border border-[#dbe4f0] ${COMPONENT_THUMBNAIL_BACKGROUND_CLASS}`}
    >
      <LucideIconGlyph
        name={iconName}
        className="h-5.5 w-5.5 text-white"
        color={DEFAULT_ICON_COLOR}
        strokeWidth={2.25}
      />
    </div>
  );
}

function EmojiPresetPreview({
  emojiId,
  fallback,
}: {
  emojiId: string;
  fallback?: string;
}) {
  return (
    <div
      className={`flex h-10 w-12 shrink-0 items-center justify-center rounded-md border border-[#dbe4f0] ${COMPONENT_THUMBNAIL_BACKGROUND_CLASS}`}
    >
      <EmojiGlyph
        id={emojiId}
        fallback={fallback}
        className="h-6 w-6 text-xl"
      />
    </div>
  );
}

function PresetButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex aspect-[1.25/1] items-center justify-center rounded-sm border border-[#e2e8f0] bg-[#f8fafc] p-3 transition-colors hover:border-[#4f46e5]"
    >
      {children}
    </button>
  );
}

function FavoriteToggleButton({
  active,
  onClick,
  title,
  className = "",
}: {
  active: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  title: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`absolute z-10 rounded-full border p-1 shadow-sm backdrop-blur transition-colors ${active ? "border-amber-300 bg-amber-50 text-amber-500" : "border-white/70 bg-white/90 text-slate-400 hover:text-amber-500"} ${className}`}
    >
      <Star className={`h-3.5 w-3.5 ${active ? "fill-current" : ""}`} />
    </button>
  );
}

export function LeftSidebar() {
  const { state, dispatch } = useAppContext();
  const {
    project,
    activeSceneIndex,
    sharedAssets,
    sharedSavedComponents,
    favoriteComponents,
    dictionaryEntries,
    templates,
    selectedSequenceStep,
  } = state;
  const activeScene = project.scenes[activeSceneIndex];
  const localAssets = project.assets;
  const availableAssets = mergeAssetLibraries(project.assets, sharedAssets);
  const projectAssetsById = new Map<string, Asset>(
    availableAssets.map((asset) => [asset.id, asset]),
  );
  const localAssetIds = new Set(localAssets.map((asset) => asset.id));
  const sharedAssetIds = new Set(sharedAssets.map((asset) => asset.id));
  const sceneTemplates = templates.filter(
    (template) => (template.kind || "scene") === "scene",
  );
  const branchTemplates = templates.filter(
    (template) => template.kind === "branch",
  );
  const [activeTab, setActiveTab] = useState<"library" | "templates">(
    "library",
  );
  const [componentTab, setComponentTab] = useState<
    "favorites" | "presets" | "icons" | "emojis" | "assets" | "dictionary"
  >("favorites");
  const [templateTab, setTemplateTab] = useState<"scene" | "branch">("branch");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null,
  );
  const [editingTemplateName, setEditingTemplateName] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [manualDictionaryEntry, setManualDictionaryEntry] = useState(
    EMPTY_MANUAL_DICTIONARY_ENTRY,
  );
  const [manualDictionaryError, setManualDictionaryError] = useState("");
  const [dictionaryJson, setDictionaryJson] = useState("");
  const [dictionaryImportError, setDictionaryImportError] = useState("");
  const [dictionaryTemplateCopied, setDictionaryTemplateCopied] =
    useState(false);
  const [iconQuery, setIconQuery] = useState("");
  const [emojiQuery, setEmojiQuery] = useState("");
  const [assetLibraryTab, setAssetLibraryTab] = useState<"local" | "pexels">(
    "local",
  );
  const [pexelsQuery, setPexelsQuery] = useState("");
  const [pexelsOrientation, setPexelsOrientation] =
    useState<PexelsOrientation>("all");
  const [pexelsSize, setPexelsSize] = useState<PexelsSize>("all");
  const [pexelsColor, setPexelsColor] = useState<PexelsColor>("all");
  const [pexelsPage, setPexelsPage] = useState(1);
  const [pexelsPhotos, setPexelsPhotos] = useState<PexelsPhoto[]>([]);
  const [pexelsTotalResults, setPexelsTotalResults] = useState(0);
  const [pexelsHasNextPage, setPexelsHasNextPage] = useState(false);
  const [pexelsStatus, setPexelsStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [pexelsError, setPexelsError] = useState("");
  const [isImportingPexelsId, setIsImportingPexelsId] = useState<number | null>(
    null,
  );
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [showSharedAssets, setShowSharedAssets] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return (
      window.localStorage.getItem(SHARED_ASSETS_VISIBILITY_STORAGE_KEY) !==
      "false"
    );
  });
  const [savedComponentTypeFilter, setSavedComponentTypeFilter] =
    useState<SavedComponentTypeFilter>("all");
  const defaultRevealStep = selectedSequenceStep ?? 1;
  const deferredLibraryQuery = useDeferredValue(libraryQuery);
  const deferredIconQuery = useDeferredValue(iconQuery);
  const deferredEmojiQuery = useDeferredValue(emojiQuery);
  const deferredPexelsQuery = useDeferredValue(pexelsQuery);
  const normalizedLibraryQuery = deferredLibraryQuery.trim().toLowerCase();
  const filteredIcons = deferredIconQuery.trim()
    ? searchLucideIcons(deferredIconQuery, 72)
    : FEATURED_ICON_NAMES;
  const filteredEmojis = deferredEmojiQuery.trim()
    ? searchEmojis(deferredEmojiQuery, 72)
    : FEATURED_EMOJI_IDS.map((id) => getEmojiById(id)).filter(
        (entry): entry is NonNullable<ReturnType<typeof getEmojiById>> =>
          Boolean(entry),
      );

  useEffect(() => {
    window.localStorage.setItem(
      SHARED_ASSETS_VISIBILITY_STORAGE_KEY,
      String(showSharedAssets),
    );
  }, [showSharedAssets]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    setPexelsPage(1);
  }, [deferredPexelsQuery, pexelsOrientation, pexelsSize, pexelsColor]);

  useEffect(() => {
    if (componentTab !== "assets" || assetLibraryTab !== "pexels") {
      return;
    }

    if (!PEXELS_IS_CONFIGURED) {
      setPexelsStatus("idle");
      setPexelsPhotos([]);
      setPexelsError("");
      setPexelsTotalResults(0);
      setPexelsHasNextPage(false);
      return;
    }

    if (!isOnline) {
      setPexelsStatus("error");
      setPexelsPhotos([]);
      setPexelsError("Offline. Your uploaded assets are still available.");
      setPexelsTotalResults(0);
      setPexelsHasNextPage(false);
      return;
    }

    const abortController = new AbortController();
    setPexelsStatus("loading");
    setPexelsError("");

    searchPexelsPhotos({
      query: deferredPexelsQuery,
      page: pexelsPage,
      perPage: 18,
      orientation: pexelsOrientation,
      size: pexelsSize,
      color: pexelsColor,
      signal: abortController.signal,
    })
      .then((result) => {
        setPexelsStatus("success");
        setPexelsTotalResults(result.totalResults);
        setPexelsHasNextPage(result.hasNextPage);
        setPexelsPhotos((currentPhotos) =>
          pexelsPage === 1
            ? result.photos
            : [
                ...currentPhotos,
                ...result.photos.filter(
                  (photo) =>
                    !currentPhotos.some(
                      (currentPhoto) => currentPhoto.id === photo.id,
                    ),
                ),
              ],
        );
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        setPexelsStatus("error");
        setPexelsPhotos([]);
        setPexelsTotalResults(0);
        setPexelsHasNextPage(false);
        setPexelsError(
          error instanceof Error
            ? error.message
            : "Pexels search is unavailable right now.",
        );
      });

    return () => {
      abortController.abort();
    };
  }, [
    assetLibraryTab,
    componentTab,
    deferredPexelsQuery,
    isOnline,
    pexelsColor,
    pexelsOrientation,
    pexelsPage,
    pexelsSize,
  ]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file: File) => {
      void (async () => {
        const asset = await createAssetFromFile(file);
        dispatch({
          type: "ADD_ASSET",
          payload: asset,
        });
      })();
    });
  };

  const addTextBlockElement = () => {
    const newElement: TextElement = {
      id: generateId(),
      type: "text",
      variant: "block",
      text: "Main Title\nSubtitle text here",
      x: 100,
      y: 100,
      width: 400,
      height: 120,
      revealStep: defaultRevealStep,
      fontSize: 40,
      subtitleFontSize: 20,
      padding: 20,
      fontWeight: "bold",
      color: "#ffffff",
    };
    dispatch({ type: "ADD_ELEMENT", payload: newElement });
  };

  const addFreeTextElement = () => {
    const newElement: TextElement = {
      id: generateId(),
      type: "text",
      variant: "free",
      text: "Add your text here",
      x: 120,
      y: 120,
      width: 520,
      height: 140,
      revealStep: defaultRevealStep,
      fontSize: 64,
      fontWeight: "bold",
      color: "#0f172a",
    };
    dispatch({ type: "ADD_ELEMENT", payload: newElement });
  };

  const addYesElement = () => {
    const newElement: ShapeElement = {
      id: generateId(),
      type: "shape",
      shapeType: "yes",
      x: 100,
      y: 100,
      width: 160,
      height: 160,
      revealStep: defaultRevealStep,
    };
    dispatch({ type: "ADD_ELEMENT", payload: newElement });
  };

  const addNoElement = () => {
    const newElement: ShapeElement = {
      id: generateId(),
      type: "shape",
      shapeType: "no",
      x: 300,
      y: 100,
      width: 160,
      height: 160,
      revealStep: defaultRevealStep,
    };
    dispatch({ type: "ADD_ELEMENT", payload: newElement });
  };

  const addCheckElement = () => {
    const newElement: ShapeElement = {
      id: generateId(),
      type: "shape",
      shapeType: "check",
      x: 120,
      y: 320,
      width: 140,
      height: 140,
      revealStep: defaultRevealStep,
    };
    dispatch({ type: "ADD_ELEMENT", payload: newElement });
  };

  const addCrossElement = () => {
    const newElement: ShapeElement = {
      id: generateId(),
      type: "shape",
      shapeType: "cross",
      x: 340,
      y: 320,
      width: 140,
      height: 140,
      revealStep: defaultRevealStep,
    };
    dispatch({ type: "ADD_ELEMENT", payload: newElement });
  };

  const addColorElement = () => {
    const newElement: ColorElement = {
      id: generateId(),
      type: "color",
      fillColor: "#f59e0b",
      captionText: "",
      x: 180,
      y: 150,
      width: 250,
      height: 250,
      revealStep: defaultRevealStep,
    };
    dispatch({ type: "ADD_ELEMENT", payload: newElement });
  };

  const addIconElement = (iconName: string) => {
    const newElement: ShapeElement = {
      id: generateId(),
      type: "shape",
      shapeType: "icon",
      iconName,
      iconColor: DEFAULT_ICON_COLOR,
      iconStrokeWidth: 2.25,
      x: 160,
      y: 180,
      width: 150,
      height: 150,
      revealStep: defaultRevealStep,
    };
    dispatch({ type: "ADD_ELEMENT", payload: newElement });
  };

  const addImageElement = (assetId: string) => {
    const asset = projectAssetsById.get(assetId);
    const newElement: ImageElement = {
      id: generateId(),
      type: "image",
      assetId,
      captionText: "",
      frameStyle: getDefaultImageFrameStyle(asset),
      x: 150,
      y: 150,
      width: 250,
      height: 250,
      revealStep: defaultRevealStep,
    };
    dispatch({ type: "ADD_ELEMENT", payload: newElement });
  };

  const addEmojiElement = (emojiId: string) => {
    const emojiEntry = getEmojiById(emojiId);
    if (!emojiEntry) {
      return;
    }

    const newElement: ShapeElement = {
      id: generateId(),
      type: "shape",
      shapeType: "emoji",
      emojiHexcode: emojiEntry.id,
      emojiChar: emojiEntry.emoji,
      x: 160,
      y: 180,
      width: 150,
      height: 150,
      revealStep: defaultRevealStep,
    };
    dispatch({ type: "ADD_ELEMENT", payload: newElement });
  };

  const presetDefinitions: Array<{
    id: PresetId;
    label: string;
    onClick: () => void;
    preview: React.ReactNode;
  }> = [
    {
      id: "free-text",
      label: "Free Text",
      onClick: addFreeTextElement,
      preview: <TextPresetPreview />,
    },
    {
      id: "text-block",
      label: "Text Block",
      onClick: addTextBlockElement,
      preview: <TextPresetPreview block />,
    },
    {
      id: "yes-badge",
      label: "Yes Badge",
      onClick: addYesElement,
      preview: <BadgePresetPreview type="yes" />,
    },
    {
      id: "no-badge",
      label: "No Badge",
      onClick: addNoElement,
      preview: <BadgePresetPreview type="no" />,
    },
    {
      id: "color-card",
      label: "Solid Color Card",
      onClick: addColorElement,
      preview: <ColorCardPresetPreview />,
    },
    {
      id: "blue-check",
      label: "Blue Check",
      onClick: addCheckElement,
      preview: <MarkPresetPreview type="check" />,
    },
    {
      id: "red-cross",
      label: "Red X",
      onClick: addCrossElement,
      preview: <MarkPresetPreview type="cross" />,
    },
  ];

  const presetDefinitionsById = new Map(
    presetDefinitions.map((preset) => [preset.id, preset]),
  );

  const isFavorite = (favorite: FavoriteComponent) =>
    favoriteComponents.some(
      (entry) => entry.type === favorite.type && entry.id === favorite.id,
    );

  const toggleFavorite = (favorite: FavoriteComponent) => {
    dispatch({ type: "TOGGLE_FAVORITE_COMPONENT", payload: favorite });
  };

  const favoritePresets = favoriteComponents.filter(
    (favorite): favorite is Extract<FavoriteComponent, { type: "preset" }> =>
      favorite.type === "preset",
  );
  const filteredFavoritePresets = favoritePresets.filter((favorite) => {
    const preset = presetDefinitionsById.get(favorite.id);
    return matchesSearchQuery(
      normalizedLibraryQuery,
      preset?.label,
      favorite.id,
    );
  });
  const favoriteIcons = favoriteComponents.filter(
    (favorite): favorite is Extract<FavoriteComponent, { type: "icon" }> =>
      favorite.type === "icon",
  );
  const filteredFavoriteIcons = favoriteIcons.filter((favorite) =>
    matchesSearchQuery(
      normalizedLibraryQuery,
      favorite.id,
      formatIconName(favorite.id),
    ),
  );
  const favoriteEmojis = favoriteComponents
    .filter(
      (favorite): favorite is Extract<FavoriteComponent, { type: "emoji" }> =>
        favorite.type === "emoji",
    )
    .map((favorite) => getEmojiById(favorite.id))
    .filter((entry): entry is NonNullable<ReturnType<typeof getEmojiById>> =>
      Boolean(entry),
    );
  const filteredFavoriteEmojis = favoriteEmojis.filter((emojiEntry) =>
    matchesSearchQuery(
      normalizedLibraryQuery,
      emojiEntry.id,
      emojiEntry.emoji,
      getEmojiLabel(emojiEntry),
    ),
  );
  const favoriteAssets = favoriteComponents
    .filter(
      (favorite): favorite is Extract<FavoriteComponent, { type: "asset" }> =>
        favorite.type === "asset",
    )
    .map((favorite) => availableAssets.find((asset) => asset.id === favorite.id))
    .filter((asset): asset is (typeof availableAssets)[number] =>
      Boolean(asset),
    );
  const filteredFavoriteAssets = favoriteAssets.filter((asset) =>
    matchesSearchQuery(
      normalizedLibraryQuery,
      asset.name,
      asset.id,
      getAssetKind(asset),
    ),
  );
  const favoriteSavedElements = favoriteComponents.filter(
    (
      favorite,
    ): favorite is SavedComponent =>
      favorite.type === "saved-element",
  );
  const sharedSavedComponentIds = new Set(
    sharedSavedComponents.map((component) => component.id),
  );
  const localSavedComponents = favoriteSavedElements.filter(
    (component) => !sharedSavedComponentIds.has(component.id),
  );
  const searchedLocalSavedComponents = localSavedComponents.filter((component) =>
    matchesSearchQuery(normalizedLibraryQuery, getSavedComponentSearchText(component)),
  );
  const searchedSharedSavedComponents = sharedSavedComponents.filter((component) =>
    matchesSearchQuery(normalizedLibraryQuery, getSavedComponentSearchText(component)),
  );
  const allSavedComponents = [
    ...searchedLocalSavedComponents,
    ...searchedSharedSavedComponents,
  ];
  const savedComponentTypeCounts = allSavedComponents.reduce(
    (counts, component) => {
      const type = getSavedFavoriteTypeFilterValue(component.element);
      counts.set(type, (counts.get(type) || 0) + 1);
      return counts;
    },
    new Map<SavedComponentTypeFilter, number>(),
  );
  const matchesSavedComponentTypeFilter = (component: SavedComponent) =>
    savedComponentTypeFilter === "all"
      ? true
      : getSavedFavoriteTypeFilterValue(component.element) ===
        savedComponentTypeFilter;
  const filteredLocalSavedComponents = searchedLocalSavedComponents.filter(
    matchesSavedComponentTypeFilter,
  );
  const filteredSharedSavedComponents = searchedSharedSavedComponents.filter(
    matchesSavedComponentTypeFilter,
  );
  const filteredSavedComponentCount =
    filteredLocalSavedComponents.length + filteredSharedSavedComponents.length;
  const hasFavoriteCollections =
    favoriteComponents.length > 0 || sharedSavedComponents.length > 0;
  const visibleSharedAssets = showSharedAssets
    ? sharedAssets.filter((asset) => !localAssetIds.has(asset.id))
    : [];
  const filteredVisibleSharedAssets = visibleSharedAssets.filter((asset) =>
    matchesSearchQuery(
      normalizedLibraryQuery,
      asset.name,
      asset.id,
      getAssetKind(asset),
    ),
  );
  const filteredLocalAssets = localAssets.filter((asset) =>
    matchesSearchQuery(
      normalizedLibraryQuery,
      asset.name,
      asset.id,
      getAssetKind(asset),
    ),
  );
  const filteredPresetDefinitions = presetDefinitions.filter((preset) =>
    matchesSearchQuery(normalizedLibraryQuery, preset.label, preset.id),
  );
  const filteredDictionaryEntries = dictionaryEntries.filter((entry) =>
    matchesSearchQuery(normalizedLibraryQuery, getDictionarySearchText(entry)),
  );
  const hasFavoriteSearchResults =
    filteredSavedComponentCount > 0 ||
    filteredFavoritePresets.length > 0 ||
    filteredFavoriteIcons.length > 0 ||
    filteredFavoriteEmojis.length > 0 ||
    filteredFavoriteAssets.length > 0 ||
    filteredVisibleSharedAssets.length > 0;

  const getAssetUsageCount = (assetId: string) => {
    return project.scenes.reduce((count, scene) => {
      return (
        count +
        scene.elements.filter(
          (element) => element.type === "image" && element.assetId === assetId,
        ).length
      );
    }, 0);
  };

  const deleteAsset = (assetId: string) => {
    const usageCount = getAssetUsageCount(assetId);
    const message =
      usageCount > 0
        ? `Remove this asset from the library? ${usageCount} image ${usageCount === 1 ? "element still uses it" : "elements still use it"} and will show "Image not found".`
        : "Remove this asset from the library?";

    if (!confirm(message)) return;
    dispatch({ type: "DELETE_ASSET", payload: assetId });
  };

  const deleteSharedAsset = (assetId: string) => {
    const usageCount = getAssetUsageCount(assetId);
    const message =
      usageCount > 0
        ? `Remove this shared asset? ${usageCount} image ${usageCount === 1 ? "element still uses it" : "elements still use it"} and will show "Image not found" unless the asset also exists locally.`
        : "Remove this shared asset?";

    if (!confirm(message)) return;
    dispatch({ type: "DELETE_SHARED_ASSET", payload: assetId });
  };

  const toggleAssetSharing = (asset: Asset) => {
    if (sharedAssetIds.has(asset.id)) {
      dispatch({ type: "DELETE_SHARED_ASSET", payload: asset.id });
      return;
    }

    dispatch({ type: "ADD_SHARED_ASSET", payload: asset });
  };

  const toggleSharedSavedComponent = (component: SavedComponent) => {
    if (sharedSavedComponentIds.has(component.id)) {
      dispatch({ type: "DELETE_SHARED_SAVED_COMPONENT", payload: component.id });
      return;
    }

    dispatch({ type: "UPSERT_SHARED_SAVED_COMPONENT", payload: component });
  };

  const deleteSavedComponent = (component: SavedComponent) => {
    const message = sharedSavedComponentIds.has(component.id)
      ? `Delete "${component.name}" from saved components and the shared library?`
      : `Delete "${component.name}" from saved components?`;

    if (!confirm(message)) return;
    dispatch({ type: "DELETE_SAVED_COMPONENT", payload: component.id });
  };

  const importPexelsPhoto = async (photo: PexelsPhoto) => {
    setIsImportingPexelsId(photo.id);

    try {
      const dataUrl = await convertRemoteImageToDataUrl(getPexelsAssetUrl(photo));

      dispatch({
        type: "ADD_ASSET",
        payload: {
          id: generateId(),
          name: getPexelsPhotoLabel(photo),
          dataUrl,
          kind: "photo",
        },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to import image from Pexels.";
      window.alert(message);
    } finally {
      setIsImportingPexelsId(null);
    }
  };

  const saveCurrentAsTemplate = (kind: "scene" | "branch") => {
    const currentScene = project.scenes[activeSceneIndex];
    if (!currentScene) return;

    const templateName =
      kind === "branch"
        ? `${currentScene.name} Branch`
        : `${currentScene.name} Template`;
    dispatch({
      type: "ADD_TEMPLATE",
      payload: buildSceneTemplate(currentScene, availableAssets, templateName, {
        kind,
      }),
    });
  };

  const useTemplate = (templateId: string) => {
    dispatch({ type: "USE_TEMPLATE", payload: templateId });
  };

  const addManualDictionaryWord = (event: React.FormEvent) => {
    event.preventDefault();

    const arabicWord = manualDictionaryEntry.arabicWord.trim();
    const phonetic = manualDictionaryEntry.phonetic.trim();
    const pronunciation = manualDictionaryEntry.pronunciation.trim();

    if (!arabicWord) {
      setManualDictionaryError("Arabic word is required.");
      return;
    }

    const now = new Date().toISOString();
    dispatch({
      type: "UPSERT_DICTIONARY_ENTRIES",
      payload: [
        {
          id: generateId(),
          arabicWord,
          phonetic,
          pronunciation,
          components: [],
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    setManualDictionaryEntry(EMPTY_MANUAL_DICTIONARY_ENTRY);
    setManualDictionaryError("");
    setComponentTab("dictionary");
  };

  const copyDictionaryJsonTemplate = () => {
    const markCopied = () => {
      setDictionaryTemplateCopied(true);
      window.setTimeout(() => setDictionaryTemplateCopied(false), 1800);
    };

    if (!navigator.clipboard) {
      setDictionaryJson(DICTIONARY_JSON_TEMPLATE);
      markCopied();
      return;
    }

    void navigator.clipboard
      .writeText(DICTIONARY_JSON_TEMPLATE)
      .then(markCopied)
      .catch(() => {
        setDictionaryJson(DICTIONARY_JSON_TEMPLATE);
        markCopied();
      });
  };

  const importDictionaryJson = (jsonValue = dictionaryJson) => {
    try {
      const importedEntries = parseDictionaryJson(jsonValue);

      if (importedEntries.length === 0) {
        setDictionaryImportError(
          "No dictionary words found. Use an array or an object with a words array.",
        );
        return;
      }

      dispatch({
        type: "UPSERT_DICTIONARY_ENTRIES",
        payload: importedEntries,
      });
      setDictionaryJson("");
      setDictionaryImportError("");
      setComponentTab("dictionary");
    } catch {
      setDictionaryImportError("Invalid JSON. Check commas and quotes.");
    }
  };

  const handleDictionaryFileImport = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void file.text().then((value) => {
      setDictionaryJson(value);
      importDictionaryJson(value);
    });
    event.target.value = "";
  };

  const deleteDictionaryEntry = (entry: DictionaryEntry) => {
    const message = `Delete "${entry.arabicWord}" from the dictionary?`;
    if (!confirm(message)) return;

    dispatch({ type: "DELETE_DICTIONARY_ENTRY", payload: entry.id });
  };

  const deleteDictionaryComponent = (
    entry: DictionaryEntry,
    component: SavedComponent,
  ) => {
    dispatch({
      type: "DELETE_DICTIONARY_COMPONENT",
      payload: { entryId: entry.id, componentId: component.id },
    });
  };

  const addDictionaryComponents = (entry: DictionaryEntry) => {
    entry.components.forEach((component, index) =>
      addSavedFavoriteElement(component, index, entry.components.length),
    );
  };

  const addSavedFavoriteElement = (
    favorite: SavedComponent,
    placementIndex = 0,
    placementCount = 1,
  ) => {
    const nextElement = cloneFavoriteElement(favorite.element);
    const nextWidth = Math.max(1, Math.round(nextElement.width));
    const nextHeight = Math.max(1, Math.round(nextElement.height));
    const offsetX =
      placementCount > 1
        ? (placementIndex - (placementCount - 1) / 2) * Math.min(nextWidth + 28, 260)
        : 0;
    const offsetY =
      placementCount > 1
        ? (placementIndex % 2) * Math.min(nextHeight * 0.2, 48)
        : 0;
    const nextX = Math.min(
      Math.max(Math.round((1920 - nextWidth) / 2 + offsetX), 0),
      Math.max(0, 1920 - nextWidth),
    );
    const nextY = Math.min(
      Math.max(Math.round((1080 - nextHeight) / 2 + offsetY), 0),
      Math.max(0, 1080 - nextHeight),
    );

    if (nextElement.type === "image") {
      let assetId = nextElement.assetId;
      const existingAsset = projectAssetsById.get(assetId);

      if (!existingAsset) {
        if (!favorite.asset) {
          window.alert(
            "This saved component is missing its image asset, so it can't be added right now.",
          );
          return;
        }

        assetId = generateId();
        dispatch({
          type: "ADD_ASSET",
          payload: {
            ...favorite.asset,
            id: assetId,
          },
        });
      }

      dispatch({
        type: "ADD_ELEMENT",
        payload: {
          ...nextElement,
          id: generateId(),
          assetId,
          x: nextX,
          y: nextY,
          revealStep: defaultRevealStep,
          hideStep: null,
          keyframes: undefined,
        },
      });
      return;
    }

    dispatch({
      type: "ADD_ELEMENT",
      payload: {
        ...nextElement,
        id: generateId(),
        x: nextX,
        y: nextY,
        revealStep: defaultRevealStep,
        hideStep: null,
        keyframes: undefined,
      },
    });
  };

  const activeTemplates =
    templateTab === "scene" ? sceneTemplates : branchTemplates;

  const renderSavedComponentCard = (favorite: SavedComponent) => {
    const isSavedFavorite = isFavorite({
      type: "saved-element",
      id: favorite.id,
      name: favorite.name,
      element: favorite.element,
      asset: favorite.asset,
    });
    const isSharedSavedComponent = sharedSavedComponentIds.has(favorite.id);

    return (
      <div key={favorite.id} className="relative">
        <FavoriteToggleButton
          active={isSavedFavorite}
          title={`${isSavedFavorite ? "Remove" : "Add"} ${favorite.name} ${isSavedFavorite ? "from" : "to"} favorites`}
          onClick={(event) => {
            event.stopPropagation();
            toggleFavorite({
              type: "saved-element",
              id: favorite.id,
              name: favorite.name,
              element: favorite.element,
              asset: favorite.asset,
            });
          }}
          className="right-1.5 top-1.5"
        />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggleSharedSavedComponent(favorite);
          }}
          className={`absolute left-1.5 top-1.5 z-10 rounded-full border p-1 shadow-sm backdrop-blur transition-colors ${
            isSharedSavedComponent
              ? "border-[#6366f1] bg-[#4f46e5] text-white hover:bg-[#4338ca]"
              : "border-white/70 bg-white/90 text-slate-400 hover:text-[#4f46e5]"
          }`}
          title={
            isSharedSavedComponent
              ? "Remove from shared library"
              : "Add to shared library"
          }
        >
          <Layers className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            deleteSavedComponent(favorite);
          }}
          className="absolute bottom-1.5 right-1.5 z-10 rounded-full border border-white/70 bg-white/90 p-1 text-slate-400 shadow-sm backdrop-blur transition-colors hover:text-rose-500"
          title="Delete saved component"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => addSavedFavoriteElement(favorite)}
          title={favorite.name}
          className="flex w-full flex-col rounded-sm border border-[#e2e8f0] bg-[#f8fafc] p-2 text-left transition-colors hover:border-[#4f46e5] hover:bg-white"
        >
          <SavedElementFavoritePreview favorite={favorite} />
          <div className="mt-2 truncate text-[11px] font-semibold text-[#0f172a]">
            {favorite.name}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="truncate text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
              {getSavedFavoriteTypeLabel(favorite.element)}
            </div>
            {isSharedSavedComponent && (
              <div className="rounded-full bg-[#4f46e5]/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-[#4f46e5]">
                Shared
              </div>
            )}
          </div>
        </button>
      </div>
    );
  };

  const renderDictionaryCard = (entry: DictionaryEntry) => (
    <div
      key={entry.id}
      className="rounded-sm border border-[#e2e8f0] bg-[#f8fafc] p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            if (entry.components.length > 0) {
              addDictionaryComponents(entry);
            }
          }}
          className="min-w-0 flex-1 text-left"
          title={
            entry.components.length > 0
              ? `Add ${entry.components.length} mapped component${entry.components.length === 1 ? "" : "s"}`
              : entry.arabicWord
          }
        >
          <div
            className="truncate text-lg font-bold leading-tight text-[#0f172a]"
            dir="auto"
          >
            {entry.arabicWord}
          </div>
          <div className="mt-1 truncate text-[11px] font-semibold text-[#4f46e5]">
            {entry.phonetic || "No phonetic"}
          </div>
          <div className="mt-0.5 truncate text-[10px] font-medium text-slate-500">
            {entry.pronunciation || "No pronunciation"}
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {entry.components.length > 0 && (
            <button
              type="button"
              onClick={() => addDictionaryComponents(entry)}
              className="flex h-8 w-8 items-center justify-center rounded-sm border border-[#dbe4f0] bg-white text-[#4f46e5] transition-colors hover:border-[#4f46e5] hover:bg-indigo-50"
              title="Add all mapped components"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => deleteDictionaryEntry(entry)}
            className="flex h-8 w-8 items-center justify-center rounded-sm border border-[#dbe4f0] bg-white text-slate-400 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-500"
            title="Delete dictionary word"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#e2e8f0] pt-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
          Components
        </div>
        <div className="rounded-full bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
          {entry.components.length}
        </div>
      </div>

      {entry.components.length === 0 ? (
        <div className="mt-3 rounded-sm border border-dashed border-[#dbe4f0] bg-white px-3 py-4 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
          No mapped components
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {entry.components.map((component, index) => (
            <div key={component.id} className="relative">
              <button
                type="button"
                onClick={() =>
                  addSavedFavoriteElement(
                    component,
                    index,
                    entry.components.length,
                  )
                }
                title={component.name}
                className="flex w-full flex-col rounded-sm border border-[#e2e8f0] bg-white p-2 text-left transition-colors hover:border-[#4f46e5]"
              >
                <SavedElementFavoritePreview favorite={component} />
                <div className="mt-2 truncate text-[10px] font-semibold text-[#0f172a]">
                  {component.name}
                </div>
                <div className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  {getSavedFavoriteTypeLabel(component.element)}
                </div>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  deleteDictionaryComponent(entry, component);
                }}
                className="absolute right-1.5 top-1.5 z-10 rounded-full border border-white/70 bg-white/90 p-1 text-slate-400 shadow-sm transition-colors hover:text-rose-500"
                title="Remove from word"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderTemplateCard = (template: (typeof templates)[number]) => (
    <div
      key={template.id}
      className="w-full p-2 border border-[#e2e8f0] bg-[#f8fafc] text-xs font-medium rounded-sm hover:border-[#4f46e5] flex flex-col gap-2"
    >
      <button
        onClick={() => useTemplate(template.id)}
        className="relative aspect-video overflow-hidden rounded-sm border border-[#e2e8f0] bg-white group"
        title={
          template.kind === "branch"
            ? "Apply Branch To Current Scene"
            : "Use Template As New Scene"
        }
      >
        <img
          src={template.thumbnailDataUrl}
          alt={template.name}
          className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
        />
        <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/10 transition-colors" />
        <div
          className={`absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.18em] ${
            template.kind === "branch"
              ? "bg-indigo-600/90 text-white"
              : "bg-white/90 text-slate-700"
          }`}
        >
          {template.kind === "branch" ? "Branch" : "Scene"}
        </div>
      </button>

      {editingTemplateId === template.id ? (
        <div className="flex items-center gap-1 w-full">
          <input
            type="text"
            value={editingTemplateName}
            onChange={(e) => setEditingTemplateName(e.target.value)}
            className="flex-1 bg-white border border-[#e2e8f0] rounded-sm px-2 py-1 outline-none focus:border-[#4f46e5]"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                dispatch({
                  type: "UPDATE_TEMPLATE",
                  payload: { id: template.id, name: editingTemplateName },
                });
                setEditingTemplateId(null);
              } else if (e.key === "Escape") {
                setEditingTemplateId(null);
              }
            }}
          />
          <button
            onClick={() => {
              dispatch({
                type: "UPDATE_TEMPLATE",
                payload: { id: template.id, name: editingTemplateName },
              });
              setEditingTemplateId(null);
            }}
            className="p-1 text-emerald-500 hover:bg-emerald-50 rounded-sm"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setEditingTemplateId(null)}
            className="p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-sm"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between w-full">
          <div className="min-w-0 mr-2">
            <span
              className="truncate block text-[#1e293b]"
              onDoubleClick={() => {
                setEditingTemplateId(template.id);
                setEditingTemplateName(template.name);
              }}
            >
              {template.name}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              {template.kind === "branch" ? "Branch" : "Scene"} •{" "}
              {template.scene.elements.length} items • {template.assets.length}{" "}
              assets
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => {
                setEditingTemplateId(template.id);
                setEditingTemplateName(template.name);
              }}
              className="p-1 text-slate-400 hover:text-blue-500"
              title="Edit Name"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => useTemplate(template.id)}
              className="p-1 text-slate-400 hover:text-[#4f46e5]"
              title={
                template.kind === "branch"
                  ? "Apply Branch To Current Scene"
                  : "Use Template As New Scene"
              }
            >
              {template.kind === "branch" ? (
                <GitBranch className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={() => {
                if (confirm("Are you sure you want to delete this template?")) {
                  dispatch({ type: "DELETE_TEMPLATE", payload: template.id });
                }
              }}
              className="p-1 text-slate-400 hover:text-rose-500"
              title="Delete Template"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="w-72 bg-white border-r border-[#e2e8f0] flex flex-col h-full shrink-0">
      <div className="flex border-b border-[#f1f5f9]">
        <button
          className={`flex-1 py-2 text-[11px] font-bold border-b-2 transition-colors ${activeTab === "library" ? "text-[#1e293b] border-[#4f46e5] bg-white" : "text-slate-400 border-transparent hover:bg-slate-50"}`}
          onClick={() => setActiveTab("library")}
        >
          Components
        </button>
        <button
          className={`flex-1 py-2 text-[11px] font-bold border-b-2 transition-colors ${activeTab === "templates" ? "text-[#1e293b] border-[#4f46e5] bg-white" : "text-slate-400 border-transparent hover:bg-slate-50"}`}
          onClick={() => setActiveTab("templates")}
        >
          Templates
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "library" ? (
          <div className="p-4 space-y-6">
            <div>
              <div className="mb-4 grid grid-cols-6 gap-2 rounded-sm bg-[#f8fafc] p-1">
                <button
                  type="button"
                  onClick={() => setComponentTab("favorites")}
                  className={`rounded-sm p-2 flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                    componentTab === "favorites"
                      ? "bg-white text-[#1e293b] shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                  title="Favorites"
                >
                  <Star className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setComponentTab("presets")}
                  className={`rounded-sm p-2 flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                    componentTab === "presets"
                      ? "bg-white text-[#1e293b] shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                  title="Presets"
                >
                  <Layers className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setComponentTab("icons")}
                  className={`rounded-sm p-2 flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                    componentTab === "icons"
                      ? "bg-white text-[#1e293b] shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                  title="Icons"
                >
                  <Lightbulb className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setComponentTab("assets")}
                  className={`rounded-sm p-2 flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                    componentTab === "assets"
                      ? "bg-white text-[#1e293b] shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                  title="Assets"
                >
                  <Image className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setComponentTab("emojis")}
                  className={`rounded-sm p-2 flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                    componentTab === "emojis"
                      ? "bg-white text-[#1e293b] shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                  title="Emojis"
                >
                  <Smile className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setComponentTab("dictionary")}
                  className={`rounded-sm p-2 flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                    componentTab === "dictionary"
                      ? "bg-white text-[#1e293b] shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                  title="Dictionary"
                >
                  <BookOpen className="h-4 w-4" />
                </button>
              </div>

              {(componentTab === "favorites" ||
                componentTab === "presets" ||
                componentTab === "dictionary" ||
                (componentTab === "assets" && assetLibraryTab === "local")) && (
                <label className="mb-4 flex items-center gap-2 rounded-sm border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 focus-within:border-[#4f46e5]">
                  <Search className="h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={libraryQuery}
                    onChange={(event) => setLibraryQuery(event.target.value)}
                    placeholder={
                      componentTab === "favorites"
                        ? "Search your library..."
                        : componentTab === "presets"
                          ? "Search presets..."
                          : componentTab === "dictionary"
                            ? "Search dictionary..."
                            : "Search assets..."
                    }
                    className="w-full bg-transparent text-xs text-[#0f172a] outline-none placeholder:text-slate-400"
                  />
                </label>
              )}

              {componentTab === "favorites" ? (
                <div className="space-y-6">
                  {!hasFavoriteCollections ? (
                    <div className="rounded-sm border border-dashed border-[#dbe4f0] px-3 py-6 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      No favorites yet
                    </div>
                  ) : !hasFavoriteSearchResults ? (
                    <div className="rounded-sm border border-dashed border-[#dbe4f0] px-3 py-6 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      No library items match that search
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {allSavedComponents.length > 0 && (
                        <div>
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                              Component Type
                            </div>
                            <div className="rounded-full bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
                              {filteredSavedComponentCount}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {SAVED_COMPONENT_TYPE_FILTER_OPTIONS.filter(
                              (option) =>
                                option.value === "all" ||
                                savedComponentTypeCounts.has(option.value),
                            ).map((option) => {
                              const Icon = option.icon;
                              const isActive =
                                savedComponentTypeFilter === option.value;
                              const count =
                                option.value === "all"
                                  ? allSavedComponents.length
                                  : savedComponentTypeCounts.get(option.value) ||
                                    0;

                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() =>
                                    setSavedComponentTypeFilter(option.value)
                                  }
                                  className={`group relative flex h-10 w-10 items-center justify-center rounded-2xl border shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f46e5]/30 ${
                                    isActive
                                      ? "border-[#4f46e5] bg-[#4f46e5] text-white shadow-[0_10px_24px_rgba(79,70,229,0.28)]"
                                      : "border-[#dbe4f0] bg-white text-slate-500 hover:-translate-y-0.5 hover:border-[#a5b4fc] hover:text-[#4338ca]"
                                  }`}
                                  aria-label={`${option.label} (${count})`}
                                  title={`${option.label} (${count})`}
                                >
                                  <Icon className="h-4 w-4" strokeWidth={2.1} />
                                  <span className="sr-only">{option.label}</span>
                                  <span
                                    className={`absolute -right-1 -top-1 min-w-[18px] rounded-full px-1.5 py-0.5 text-center text-[8px] font-bold tracking-[0.02em] ${
                                      isActive
                                        ? "bg-white text-[#4338ca]"
                                        : "bg-[#eef2ff] text-[#4f46e5]"
                                    }`}
                                  >
                                    {count}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {filteredLocalSavedComponents.length > 0 && (
                        <div>
                          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                            Saved Components
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {filteredLocalSavedComponents.map(
                              renderSavedComponentCard,
                            )}
                          </div>
                        </div>
                      )}

                      {filteredSharedSavedComponents.length > 0 && (
                        <div>
                          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                            Shared Components
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {filteredSharedSavedComponents.map(
                              renderSavedComponentCard,
                            )}
                          </div>
                        </div>
                      )}

                      {allSavedComponents.length > 0 &&
                        filteredSavedComponentCount === 0 && (
                          <div className="rounded-sm border border-dashed border-[#dbe4f0] px-3 py-6 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                            No saved or shared components match this type
                          </div>
                        )}

                      {filteredFavoritePresets.length > 0 && (
                        <div>
                          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                            Presets
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {filteredFavoritePresets.map((favorite) => {
                              const preset = presetDefinitionsById.get(
                                favorite.id,
                              );
                              if (!preset) return null;

                              return (
                                <div key={favorite.id} className="relative">
                                  <FavoriteToggleButton
                                    active
                                    title={`Remove ${preset.label} from favorites`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      toggleFavorite({
                                        type: "preset",
                                        id: favorite.id,
                                      });
                                    }}
                                    className="right-1.5 top-1.5"
                                  />
                                  <PresetButton
                                    label={preset.label}
                                    onClick={preset.onClick}
                                  >
                                    {preset.preview}
                                  </PresetButton>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {filteredFavoriteIcons.length > 0 && (
                        <div>
                          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                            Icons
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {filteredFavoriteIcons.map((favorite) => (
                              <div key={favorite.id} className="relative">
                                <FavoriteToggleButton
                                  active
                                  title="Remove icon from favorites"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleFavorite({
                                      type: "icon",
                                      id: favorite.id,
                                    });
                                  }}
                                  className="right-1 top-1"
                                />
                                <button
                                  type="button"
                                  onClick={() => addIconElement(favorite.id)}
                                  className="flex items-center justify-center rounded-sm border border-[#e2e8f0] bg-[#f8fafc] px-1.5 py-2 text-center transition-colors hover:border-[#4f46e5] hover:bg-white"
                                >
                                  <IconPresetPreview iconName={favorite.id} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {filteredFavoriteEmojis.length > 0 && (
                        <div>
                          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                            Emojis
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {filteredFavoriteEmojis.map((emojiEntry) => (
                              <div key={emojiEntry.id} className="relative">
                                <FavoriteToggleButton
                                  active
                                  title="Remove emoji from favorites"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleFavorite({
                                      type: "emoji",
                                      id: emojiEntry.id,
                                    });
                                  }}
                                  className="right-1 top-1"
                                />
                                <button
                                  type="button"
                                  onClick={() => addEmojiElement(emojiEntry.id)}
                                  className="flex items-center justify-center rounded-sm border border-[#e2e8f0] bg-[#f8fafc] px-1.5 py-2 text-center transition-colors hover:border-[#4f46e5] hover:bg-white"
                                  title={getEmojiLabel(emojiEntry)}
                                >
                                  <EmojiPresetPreview
                                    emojiId={emojiEntry.id}
                                    fallback={emojiEntry.emoji}
                                  />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {filteredFavoriteAssets.length > 0 && (
                        <div>
                          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                            Assets
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {filteredFavoriteAssets.map((asset) => {
                              const usageCount = getAssetUsageCount(asset.id);

                              return (
                                <div
                                  key={asset.id}
                                  className="relative aspect-square group"
                                >
                                  <FavoriteToggleButton
                                    active
                                    title={`Remove ${asset.name} from favorites`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      toggleFavorite({
                                        type: "asset",
                                        id: asset.id,
                                      });
                                    }}
                                    className="left-1.5 top-1.5"
                                  />
                                  <button
                                    onClick={() => addImageElement(asset.id)}
                                    className="h-full w-full bg-[#f1f5f9] border border-[#e2e8f0] hover:border-[#4f46e5] transition-colors cursor-pointer flex flex-col items-center justify-center overflow-hidden relative"
                                    title={asset.name}
                                  >
                                    <img
                                      src={asset.dataUrl}
                                      alt={asset.name}
                                      className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                      <Plus className="w-6 h-6 text-white" />
                                    </div>
                                  </button>

                                  <button
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      deleteAsset(asset.id);
                                    }}
                                    className="absolute top-1.5 right-1.5 rounded-full bg-white/90 p-1 text-slate-500 opacity-0 shadow-sm transition-all hover:bg-white hover:text-rose-500 group-hover:opacity-100"
                                    title={
                                      usageCount > 0
                                        ? `Delete Asset (${usageCount} uses)`
                                        : "Delete Asset"
                                    }
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>

                                  {usageCount > 0 && (
                                    <div className="absolute left-1.5 bottom-1.5 rounded-full bg-slate-900/70 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white">
                                      {usageCount} use
                                      {usageCount === 1 ? "" : "s"}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                        Shared Assets
                      </div>
                      <div className="flex items-center gap-3">
                        {showSharedAssets && (
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#4f46e5]">
                            {filteredVisibleSharedAssets.length}
                          </div>
                        )}
                        <div className="inline-flex rounded-sm border border-[#dbe4f0] bg-white p-1">
                          <button
                            type="button"
                            onClick={() => setShowSharedAssets(true)}
                            className={`rounded-sm px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors ${
                              showSharedAssets
                                ? "bg-[#4f46e5] text-white"
                                : "text-slate-500 hover:bg-slate-50"
                            }`}
                          >
                            On
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowSharedAssets(false)}
                            className={`rounded-sm px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors ${
                              !showSharedAssets
                                ? "bg-slate-900 text-white"
                                : "text-slate-500 hover:bg-slate-50"
                            }`}
                          >
                            Off
                          </button>
                        </div>
                      </div>
                    </div>

                    {showSharedAssets ? (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                          {filteredVisibleSharedAssets.map((asset) => {
                            const usageCount = getAssetUsageCount(asset.id);

                            return (
                              <div
                                key={asset.id}
                                className="relative aspect-square group"
                              >
                                <FavoriteToggleButton
                                  active={isFavorite({
                                    type: "asset",
                                    id: asset.id,
                                  })}
                                  title={`${isFavorite({ type: "asset", id: asset.id }) ? "Remove" : "Add"} ${asset.name} ${isFavorite({ type: "asset", id: asset.id }) ? "from" : "to"} favorites`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleFavorite({
                                      type: "asset",
                                      id: asset.id,
                                    });
                                  }}
                                  className="left-1.5 top-1.5"
                                />
                                <button
                                  onClick={() => addImageElement(asset.id)}
                                  className="relative flex h-full w-full cursor-pointer flex-col items-center justify-center overflow-hidden border border-[#e2e8f0] bg-[#f1f5f9] transition-colors hover:border-[#4f46e5]"
                                  title={asset.name}
                                >
                                  <img
                                    src={asset.dataUrl}
                                    alt={asset.name}
                                    className="h-full w-full object-contain"
                                  />
                                  <div className="absolute bottom-1.5 right-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-slate-500 shadow-sm">
                                    {getAssetKind(asset)}
                                  </div>
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                                    <Plus className="h-6 w-6 text-white" />
                                  </div>
                                </button>

                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    deleteSharedAsset(asset.id);
                                  }}
                                  className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1 text-slate-500 opacity-0 shadow-sm transition-all hover:bg-white hover:text-rose-500 group-hover:opacity-100"
                                  title={
                                    usageCount > 0
                                      ? `Delete Shared Asset (${usageCount} uses)`
                                      : "Delete Shared Asset"
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>

                                <div className="absolute bottom-1.5 left-1.5 flex flex-col gap-1">
                                  <div className="rounded-full bg-[#4f46e5]/90 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white">
                                    Shared
                                  </div>
                                  {usageCount > 0 && (
                                    <div className="rounded-full bg-slate-900/70 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white">
                                      {usageCount} use
                                      {usageCount === 1 ? "" : "s"}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {filteredVisibleSharedAssets.length === 0 && (
                          <div className="mt-3 rounded-sm border border-dashed border-[#dbe4f0] px-3 py-5 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                            {normalizedLibraryQuery
                              ? "No shared assets match that search"
                              : "No separate shared assets yet. Promote a local asset when you want to reuse it across projects."}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="mt-3 rounded-sm border border-dashed border-[#dbe4f0] px-3 py-5 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                        Shared assets are hidden. Favorite components stay visible.
                      </div>
                    )}
                  </div>
                </div>
              ) : componentTab === "dictionary" ? (
                <div className="space-y-5">
                  <form
                    onSubmit={addManualDictionaryWord}
                    className="space-y-3 rounded-sm border border-[#e2e8f0] bg-[#f8fafc] p-3"
                  >
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      Manual Word
                    </div>
                    <input
                      type="text"
                      value={manualDictionaryEntry.arabicWord}
                      onChange={(event) => {
                        setManualDictionaryEntry((entry) => ({
                          ...entry,
                          arabicWord: event.target.value,
                        }));
                        setManualDictionaryError("");
                      }}
                      placeholder="Arabic Word"
                      dir="auto"
                      className="h-9 w-full rounded-sm border border-[#e2e8f0] bg-white px-2 text-[12px] font-semibold text-[#0f172a] outline-none focus:border-[#4f46e5]"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={manualDictionaryEntry.phonetic}
                        onChange={(event) => {
                          setManualDictionaryEntry((entry) => ({
                            ...entry,
                            phonetic: event.target.value,
                          }));
                          setManualDictionaryError("");
                        }}
                        placeholder="Phonetic"
                        className="h-9 min-w-0 rounded-sm border border-[#e2e8f0] bg-white px-2 text-[12px] text-[#0f172a] outline-none focus:border-[#4f46e5]"
                      />
                      <input
                        type="text"
                        value={manualDictionaryEntry.pronunciation}
                        onChange={(event) => {
                          setManualDictionaryEntry((entry) => ({
                            ...entry,
                            pronunciation: event.target.value,
                          }));
                          setManualDictionaryError("");
                        }}
                        placeholder="Pronunciation"
                        className="h-9 min-w-0 rounded-sm border border-[#e2e8f0] bg-white px-2 text-[12px] text-[#0f172a] outline-none focus:border-[#4f46e5]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!manualDictionaryEntry.arabicWord.trim()}
                      className="flex w-full items-center justify-center gap-2 rounded-sm border border-[#dbe4f0] bg-white py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600 transition-colors hover:border-[#4f46e5] hover:text-[#4f46e5] disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:border-[#dbe4f0]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Word
                    </button>
                    {manualDictionaryError && (
                      <div className="rounded-sm border border-rose-100 bg-rose-50 px-3 py-2 text-[10px] font-semibold text-rose-600">
                        {manualDictionaryError}
                      </div>
                    )}
                  </form>

                  <div className="space-y-3 rounded-sm border border-[#e2e8f0] bg-[#f8fafc] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                        JSON Import
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={copyDictionaryJsonTemplate}
                          title="Copy JSON template"
                          className="flex h-8 w-8 items-center justify-center rounded-sm border border-[#dbe4f0] bg-white text-slate-500 transition-colors hover:border-[#4f46e5] hover:text-[#4f46e5]"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <label
                          title="Upload JSON"
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border border-[#dbe4f0] bg-white text-slate-500 transition-colors hover:border-[#4f46e5] hover:text-[#4f46e5]"
                        >
                          <Upload className="h-4 w-4" />
                          <input
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            onChange={handleDictionaryFileImport}
                          />
                        </label>
                      </div>
                    </div>
                    <pre className="max-h-52 overflow-auto rounded-sm border border-[#e2e8f0] bg-white p-2 font-mono text-[10px] leading-relaxed text-slate-500">
                      {DICTIONARY_JSON_TEMPLATE}
                    </pre>
                    {dictionaryTemplateCopied && (
                      <div className="rounded-sm border border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] font-semibold text-emerald-700">
                        JSON template copied.
                      </div>
                    )}
                    <textarea
                      value={dictionaryJson}
                      onChange={(event) => {
                        setDictionaryJson(event.target.value);
                        setDictionaryImportError("");
                      }}
                      placeholder='[{"Arabic Word":"...","Phonetic":"...","Pronunciation":"..."}]'
                      className="min-h-[96px] w-full resize-none rounded-sm border border-[#e2e8f0] bg-white p-2 font-mono text-[11px] leading-relaxed text-[#0f172a] outline-none focus:border-[#4f46e5]"
                    />
                    <button
                      type="button"
                      onClick={() => importDictionaryJson()}
                      disabled={!dictionaryJson.trim()}
                      className="flex w-full items-center justify-center gap-2 rounded-sm border border-[#dbe4f0] bg-white py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600 transition-colors hover:border-[#4f46e5] hover:text-[#4f46e5] disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:border-[#dbe4f0]"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      Import Words
                    </button>
                    {dictionaryImportError && (
                      <div className="rounded-sm border border-rose-100 bg-rose-50 px-3 py-2 text-[10px] font-semibold text-rose-600">
                        {dictionaryImportError}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                        Dictionary Words
                      </div>
                      <div className="rounded-full bg-[#eef2ff] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#4f46e5]">
                        {filteredDictionaryEntries.length}
                      </div>
                    </div>

                    {dictionaryEntries.length === 0 ? (
                      <div className="rounded-sm border border-dashed border-[#dbe4f0] px-3 py-6 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                        No dictionary words yet
                      </div>
                    ) : filteredDictionaryEntries.length === 0 ? (
                      <div className="rounded-sm border border-dashed border-[#dbe4f0] px-3 py-6 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                        No dictionary words match that search
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {filteredDictionaryEntries.map(renderDictionaryCard)}
                      </div>
                    )}
                  </div>
                </div>
              ) : componentTab === "presets" ? (
                <div>
                  <div>
                    <h3 className="mb-4 text-[10px] font-bold text-[#64748b] uppercase tracking-[0.2em]">
                      Component Presets
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {filteredPresetDefinitions.map((preset) => (
                        <div key={preset.id} className="relative">
                          <FavoriteToggleButton
                            active={isFavorite({
                              type: "preset",
                              id: preset.id,
                            })}
                            title={`${isFavorite({ type: "preset", id: preset.id }) ? "Remove" : "Add"} ${preset.label} ${isFavorite({ type: "preset", id: preset.id }) ? "from" : "to"} favorites`}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleFavorite({ type: "preset", id: preset.id });
                            }}
                            className="right-1.5 top-1.5"
                          />
                          <PresetButton
                            label={preset.label}
                            onClick={preset.onClick}
                          >
                            {preset.preview}
                          </PresetButton>
                        </div>
                      ))}
                    </div>
                    {filteredPresetDefinitions.length === 0 && (
                      <div className="mt-3 rounded-sm border border-dashed border-[#dbe4f0] px-3 py-5 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                        No presets match that search
                      </div>
                    )}
                  </div>
                </div>
              ) : componentTab === "icons" ? (
                <div className="space-y-4">
                  <label className="flex items-center gap-2 rounded-sm border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 focus-within:border-[#4f46e5]">
                    <Search className="h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={iconQuery}
                      onChange={(event) => setIconQuery(event.target.value)}
                      placeholder="Search icons..."
                      className="w-full bg-transparent text-xs text-[#0f172a] outline-none placeholder:text-slate-400"
                    />
                  </label>

                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    <span>
                      {deferredIconQuery.trim()
                        ? "Search Results"
                        : "Featured Icons"}
                    </span>
                    <span className="text-[#4f46e5]">
                      {filteredIcons.length}
                    </span>
                  </div>

                  {filteredIcons.length === 0 ? (
                    <div className="rounded-sm border border-dashed border-[#dbe4f0] px-3 py-6 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      No icons match that search
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {filteredIcons.map((iconName) => (
                        <div key={iconName} className="relative">
                          <FavoriteToggleButton
                            active={isFavorite({ type: "icon", id: iconName })}
                            title={`${isFavorite({ type: "icon", id: iconName }) ? "Remove" : "Add"} icon ${isFavorite({ type: "icon", id: iconName }) ? "from" : "to"} favorites`}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleFavorite({ type: "icon", id: iconName });
                            }}
                            className="right-1 top-1"
                          />
                          <button
                            type="button"
                            onClick={() => addIconElement(iconName)}
                            className="flex items-center justify-center rounded-sm border border-[#e2e8f0] bg-[#f8fafc] px-1.5 py-2 text-center transition-colors hover:border-[#4f46e5] hover:bg-white"
                          >
                            <IconPresetPreview iconName={iconName} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : componentTab === "emojis" ? (
                <div className="space-y-4">
                  <label className="flex items-center gap-2 rounded-sm border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 focus-within:border-[#4f46e5]">
                    <Search className="h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={emojiQuery}
                      onChange={(event) => setEmojiQuery(event.target.value)}
                      placeholder="Search emojis..."
                      className="w-full bg-transparent text-xs text-[#0f172a] outline-none placeholder:text-slate-400"
                    />
                  </label>

                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    <span>
                      {deferredEmojiQuery.trim()
                        ? "Search Results"
                        : "Featured Emojis"}
                    </span>
                    <span className="text-[#4f46e5]">
                      {filteredEmojis.length}
                    </span>
                  </div>

                  {filteredEmojis.length === 0 ? (
                    <div className="rounded-sm border border-dashed border-[#dbe4f0] px-3 py-6 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      No emojis match that search
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {filteredEmojis.map((emojiEntry) => (
                        <div key={emojiEntry.id} className="relative">
                          <FavoriteToggleButton
                            active={isFavorite({
                              type: "emoji",
                              id: emojiEntry.id,
                            })}
                            title={`${isFavorite({ type: "emoji", id: emojiEntry.id }) ? "Remove" : "Add"} emoji ${isFavorite({ type: "emoji", id: emojiEntry.id }) ? "from" : "to"} favorites`}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleFavorite({
                                type: "emoji",
                                id: emojiEntry.id,
                              });
                            }}
                            className="right-1 top-1"
                          />
                          <button
                            type="button"
                            onClick={() => addEmojiElement(emojiEntry.id)}
                            className="flex items-center justify-center rounded-sm border border-[#e2e8f0] bg-[#f8fafc] px-1.5 py-2 text-center transition-colors hover:border-[#4f46e5] hover:bg-white"
                            title={getEmojiLabel(emojiEntry)}
                          >
                            <EmojiPresetPreview
                              emojiId={emojiEntry.id}
                              fallback={emojiEntry.emoji}
                            />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="space-y-5">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="grid flex-1 grid-cols-2 gap-2 rounded-sm bg-[#f8fafc] p-1">
                          <button
                            type="button"
                            onClick={() => setAssetLibraryTab("local")}
                            className={`rounded-sm px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] transition-colors ${
                              assetLibraryTab === "local"
                                ? "bg-[#4f46e5] text-white"
                                : "text-slate-500 hover:bg-[#eef2ff] hover:text-[#4f46e5]"
                            }`}
                          >
                            Library
                          </button>
                          <button
                            type="button"
                            onClick={() => setAssetLibraryTab("pexels")}
                            className={`rounded-sm px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] transition-colors ${
                              assetLibraryTab === "pexels"
                                ? "bg-[#4f46e5] text-white"
                                : "text-slate-500 hover:bg-[#eef2ff] hover:text-[#4f46e5]"
                            }`}
                          >
                            Pexels
                          </button>
                        </div>

                        {!isOnline && (
                          <div className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-amber-700">
                            <WifiOff className="h-3 w-3" />
                            Offline
                          </div>
                        )}
                      </div>

                      {assetLibraryTab === "pexels" && (
                        <>
                          <label className="flex items-center gap-2 rounded-sm border border-[#e2e8f0] bg-white px-3 py-2 focus-within:border-[#4f46e5]">
                            <Search className="h-3.5 w-3.5 text-slate-400" />
                            <input
                              type="text"
                              value={pexelsQuery}
                              onChange={(event) =>
                                setPexelsQuery(event.target.value)
                              }
                              placeholder="Search Pexels photos..."
                              className="w-full bg-transparent text-xs text-[#0f172a] outline-none placeholder:text-slate-400"
                            />
                          </label>

                          <div className="grid grid-cols-3 gap-2">
                            <select
                              value={pexelsOrientation}
                              onChange={(event) =>
                                setPexelsOrientation(
                                  event.target.value as PexelsOrientation,
                                )
                              }
                              className="rounded-sm border border-[#e2e8f0] bg-white px-2 py-2 text-[11px] text-slate-600 outline-none focus:border-[#4f46e5]"
                            >
                              {PEXELS_ORIENTATION_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <select
                              value={pexelsSize}
                              onChange={(event) =>
                                setPexelsSize(event.target.value as PexelsSize)
                              }
                              className="rounded-sm border border-[#e2e8f0] bg-white px-2 py-2 text-[11px] text-slate-600 outline-none focus:border-[#4f46e5]"
                            >
                              {PEXELS_SIZE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <select
                              value={pexelsColor}
                              onChange={(event) =>
                                setPexelsColor(event.target.value as PexelsColor)
                              }
                              className="rounded-sm border border-[#e2e8f0] bg-white px-2 py-2 text-[11px] text-slate-600 outline-none focus:border-[#4f46e5]"
                            >
                              {PEXELS_COLOR_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}
                    </div>

                    {assetLibraryTab === "local" ? (
                      <div className="space-y-6">
                        <div>
                          <div className="mb-3 flex items-center justify-between">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                              Local Assets
                            </div>
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#4f46e5]">
                              {filteredLocalAssets.length}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center border border-dashed border-[#cbd5e1] text-[#64748b] transition-all hover:bg-slate-50">
                              <Upload className="mb-1 h-5 w-5" />
                              <span className="text-[9px] font-bold uppercase tracking-wider">
                                Upload
                              </span>
                              <span className="mt-1 px-3 text-center text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                Adds to this project only
                              </span>
                              <input
                                type="file"
                                accept="image/*,.svg"
                                multiple
                                className="hidden"
                                onChange={handleImageUpload}
                              />
                            </label>

                            {filteredLocalAssets.map((asset) => {
                              const usageCount = getAssetUsageCount(asset.id);
                              const isSharedAsset = sharedAssetIds.has(asset.id);

                              return (
                                <div
                                  key={asset.id}
                                  className="relative aspect-square group"
                                >
                                  <FavoriteToggleButton
                                    active={isFavorite({
                                      type: "asset",
                                      id: asset.id,
                                    })}
                                    title={`${isFavorite({ type: "asset", id: asset.id }) ? "Remove" : "Add"} ${asset.name} ${isFavorite({ type: "asset", id: asset.id }) ? "from" : "to"} favorites`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      toggleFavorite({
                                        type: "asset",
                                        id: asset.id,
                                      });
                                    }}
                                    className="left-1.5 top-1.5"
                                  />
                                  <button
                                    onClick={() => addImageElement(asset.id)}
                                    className="relative flex h-full w-full cursor-pointer flex-col items-center justify-center overflow-hidden border border-[#e2e8f0] bg-[#f1f5f9] transition-colors hover:border-[#4f46e5]"
                                    title={asset.name}
                                  >
                                    <img
                                      src={asset.dataUrl}
                                      alt={asset.name}
                                      className="h-full w-full object-contain"
                                    />
                                    <div className="absolute bottom-1.5 right-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-slate-500 shadow-sm">
                                      {getAssetKind(asset)}
                                    </div>
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                                      <Plus className="h-6 w-6 text-white" />
                                    </div>
                                  </button>

                                  <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-all group-hover:opacity-100">
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        toggleAssetSharing(asset);
                                      }}
                                      className={`rounded-full p-1 shadow-sm transition-all ${
                                        isSharedAsset
                                          ? "bg-[#4f46e5] text-white hover:bg-[#4338ca]"
                                          : "bg-white/90 text-slate-500 hover:bg-white hover:text-[#4f46e5]"
                                      }`}
                                      title={
                                        isSharedAsset
                                          ? "Remove from shared assets"
                                          : "Add to shared assets"
                                      }
                                    >
                                      <Layers className="h-3.5 w-3.5" />
                                    </button>

                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        deleteAsset(asset.id);
                                      }}
                                      className="rounded-full bg-white/90 p-1 text-slate-500 shadow-sm transition-all hover:bg-white hover:text-rose-500"
                                      title={
                                        usageCount > 0
                                          ? `Delete Asset (${usageCount} uses)`
                                          : "Delete Asset"
                                      }
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>

                                  {(isSharedAsset || usageCount > 0) && (
                                    <div className="absolute bottom-1.5 left-1.5 flex flex-col gap-1">
                                      {isSharedAsset && (
                                        <div className="rounded-full bg-[#4f46e5]/90 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white">
                                          Shared
                                        </div>
                                      )}
                                      {usageCount > 0 && (
                                        <div className="rounded-full bg-slate-900/70 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white">
                                          {usageCount} use
                                          {usageCount === 1 ? "" : "s"}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {filteredLocalAssets.length === 0 && (
                            <div className="mt-3 rounded-sm border border-dashed border-[#dbe4f0] px-3 py-5 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                              {normalizedLibraryQuery
                                ? "No local assets match that search"
                                : "Upload photos, transparent PNGs, or SVG graphics to start this project&apos;s asset library"}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="mb-3 flex items-center justify-between">
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                            Pexels
                          </div>
                          {pexelsStatus === "loading" ? (
                            <Loader2 className="h-4 w-4 animate-spin text-[#4f46e5]" />
                          ) : (
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#4f46e5]">
                              {pexelsTotalResults > 0
                                ? `${pexelsPhotos.length}/${pexelsTotalResults}`
                                : pexelsPhotos.length}
                            </div>
                          )}
                        </div>

                        {!PEXELS_IS_CONFIGURED ? (
                          <div className="rounded-sm border border-dashed border-[#dbe4f0] px-3 py-5 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                            Add `VITE_PEXELS_API_KEY` to enable Pexels search
                          </div>
                        ) : !isOnline ? (
                          <div className="rounded-sm border border-dashed border-amber-200 bg-amber-50 px-3 py-5 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
                            Offline mode: shared assets still work
                          </div>
                        ) : pexelsStatus === "error" ? (
                          <div className="rounded-sm border border-dashed border-rose-200 bg-rose-50 px-3 py-5 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-rose-600">
                            {pexelsError || "Pexels search is unavailable"}
                          </div>
                        ) : pexelsStatus === "success" &&
                          pexelsPhotos.length === 0 ? (
                          <div className="rounded-sm border border-dashed border-[#dbe4f0] px-3 py-5 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                            No Pexels images match these filters
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {pexelsStatus === "loading" &&
                              pexelsPhotos.length === 0 && (
                                <div className="rounded-sm border border-dashed border-[#dbe4f0] px-3 py-5 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                                  Loading Pexels images...
                                </div>
                              )}

                            <div className="grid grid-cols-2 gap-3">
                              {pexelsPhotos.map((photo) => (
                                <div
                                  key={photo.id}
                                  className="overflow-hidden rounded-sm border border-[#e2e8f0] bg-white"
                                >
                                  <div
                                    className="relative aspect-square overflow-hidden bg-slate-100"
                                    style={{
                                      backgroundColor:
                                        photo.avg_color || "#e2e8f0",
                                    }}
                                  >
                                    <img
                                      src={getPexelsThumbnailUrl(photo)}
                                      alt={photo.alt || "Pexels photo"}
                                      loading="lazy"
                                      className="h-full w-full object-cover"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => importPexelsPhoto(photo)}
                                      disabled={
                                        isImportingPexelsId === photo.id
                                      }
                                      className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1 rounded-sm bg-white/95 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-700 shadow-sm transition-colors hover:bg-white disabled:cursor-wait disabled:opacity-70"
                                      title="Import into asset library"
                                    >
                                      {isImportingPexelsId === photo.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Plus className="h-3.5 w-3.5" />
                                      )}
                                      Import
                                    </button>
                                  </div>
                                  <div className="space-y-1 p-2">
                                    <div
                                      className="line-clamp-2 text-[11px] font-semibold text-slate-700"
                                      title={photo.alt || "Pexels photo"}
                                    >
                                      {photo.alt || "Untitled photo"}
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      {photo.photographer}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {pexelsHasNextPage && pexelsPhotos.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPexelsPage((page) => page + 1)
                                }
                                disabled={pexelsStatus === "loading"}
                                className="w-full rounded-sm border border-[#dbe4f0] bg-[#f8fafc] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600 transition-colors hover:border-[#4f46e5] hover:text-[#4f46e5] disabled:cursor-wait disabled:opacity-70"
                              >
                                {pexelsStatus === "loading"
                                  ? "Loading..."
                                  : "Load More"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-6">
            <div>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.2em]">
                  Template Library
                </h3>
                <div className="rounded-full bg-indigo-50 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-[#4f46e5]">
                  {templates.length}
                </div>
              </div>
              <div className="space-y-3">
                <div
                  className={`rounded-md border p-1.5 ${
                    templateTab === "branch"
                      ? "border-[#c7d2fe] bg-indigo-50/50"
                      : "border-[#e2e8f0] bg-[#f8fafc]"
                  }`}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTemplateTab("branch")}
                      className={`flex items-center justify-between rounded-sm px-2 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                        templateTab === "branch"
                          ? "bg-white text-[#4f46e5] shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                      title="Branches"
                    >
                      <span>Branches</span>
                      <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[8px] text-[#4f46e5]">
                        {branchTemplates.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateTab("scene")}
                      className={`flex items-center justify-between rounded-sm px-2 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                        templateTab === "scene"
                          ? "bg-white text-[#1e293b] shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                      title="Scenes"
                    >
                      <span>Scenes</span>
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] text-slate-500">
                        {sceneTemplates.length}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      saveCurrentAsTemplate(
                        templateTab === "branch" ? "branch" : "scene",
                      )
                    }
                    className={`flex h-8 items-center justify-center gap-1.5 rounded-sm border px-3 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors ${
                      templateTab === "branch"
                        ? "border-[#c7d2fe] bg-indigo-50 text-[#4f46e5] hover:bg-[#eef2ff]"
                        : "border-[#dbe4f0] bg-white text-slate-600 hover:border-[#c7d2fe] hover:text-[#4f46e5]"
                    }`}
                    title={
                      templateTab === "branch" ? "Save branch" : "Save scene"
                    }
                    aria-label={
                      templateTab === "branch" ? "Save branch" : "Save scene"
                    }
                  >
                    <Save className="h-4 w-4" />
                    <span>Save</span>
                  </button>
                </div>

                {activeTemplates.length === 0 ? (
                  <p
                    className={`rounded-sm border border-dashed px-3 py-3 text-[10px] font-bold uppercase tracking-wider ${
                      templateTab === "scene"
                        ? "border-[#dbe4f0] bg-white text-slate-300"
                        : "border-[#c7d2fe] bg-indigo-50/40 text-indigo-300"
                    }`}
                  >
                    {templateTab === "scene"
                      ? "No scene templates yet"
                      : "No branch templates yet"}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeTemplates.map(renderTemplateCard)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
