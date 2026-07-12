import React, { useEffect, useState } from 'react';
import { getEmojiById, loadEmojiAssetUrl } from '../emojiLibrary';

export function EmojiGlyph({
  id,
  fallback = '🙂',
  className,
}: {
  id: string;
  fallback?: string;
  className?: string;
}) {
  const emojiEntry = getEmojiById(id);
  const [assetUrl, setAssetUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setAssetUrl(null);

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
    return <img src={assetUrl} alt={emojiEntry.label} className={className} draggable={false} />;
  }

  return (
    <span className={className} aria-hidden="true">
      {fallback}
    </span>
  );
}
