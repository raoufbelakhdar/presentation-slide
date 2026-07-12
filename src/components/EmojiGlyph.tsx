import React from 'react';
import { getEmojiById } from '../emojiLibrary';

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

  if (emojiEntry) {
    return <img src={emojiEntry.assetUrl} alt={emojiEntry.label} className={className} draggable={false} />;
  }

  return (
    <span className={className} aria-hidden="true">
      {fallback}
    </span>
  );
}
