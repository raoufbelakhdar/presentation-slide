import React, { useEffect, useState } from 'react';
import { getOpenMojiDataUrl } from '../emojiLibrary';

export function OpenMojiGlyph({
  hexcode,
  emoji,
  className,
}: {
  hexcode: string;
  emoji: string;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getOpenMojiDataUrl(hexcode).then((nextDataUrl) => {
      if (!cancelled) {
        setDataUrl(nextDataUrl);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hexcode]);

  if (dataUrl) {
    return <img src={dataUrl} alt={emoji} className={className} draggable={false} />;
  }

  return (
    <span className={className} aria-hidden="true">
      {emoji}
    </span>
  );
}
