import React, { useEffect, useState } from 'react';
import { getCachedEmojiAssetUrl, getEmojiById, loadEmojiAssetUrl } from '../emojiLibrary';

export function EmojiGlyph({
  id,
  fallback = '🙂',
  className,
  style,
}: {
  id: string;
  fallback?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const emojiEntry = getEmojiById(id);
  const [assetUrl, setAssetUrl] = useState<string | null | undefined>(() => getCachedEmojiAssetUrl(id));

  useEffect(() => {
    let cancelled = false;
    const cachedAssetUrl = getCachedEmojiAssetUrl(id);

    setAssetUrl(cachedAssetUrl);

    loadEmojiAssetUrl(id).then((nextAssetUrl) => {
      if (!cancelled) {
        setAssetUrl(nextAssetUrl);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (emojiEntry && assetUrl) {
    return <img src={assetUrl} alt={emojiEntry.label} className={className} style={style} draggable={false} />;
  }

  return (
    <span
      className={className}
      style={{
        ...style,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
      }}
      aria-hidden="true"
    >
      {fallback}
    </span>
  );
}
