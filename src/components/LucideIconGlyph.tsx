import React from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { isKnownIconName } from '../iconLibrary';

interface LucideIconGlyphProps {
  name: string;
  className?: string;
  color?: string;
  strokeWidth?: number;
}

function FallbackGlyph({
  className,
  color = 'currentColor',
  strokeWidth = 2,
}: Omit<LucideIconGlyphProps, 'name'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="4" opacity="0.22" />
      <path d="M8 12h8" opacity="0.4" />
      <path d="M12 8v8" opacity="0.4" />
    </svg>
  );
}

export function LucideIconGlyph({
  name,
  className,
  color = 'currentColor',
  strokeWidth = 2,
}: LucideIconGlyphProps) {
  if (!isKnownIconName(name)) {
    return <FallbackGlyph className={className} color={color} strokeWidth={strokeWidth} />;
  }

  return (
    <DynamicIcon
      name={name as never}
      color={color}
      strokeWidth={strokeWidth}
      className={className}
      fallback={() => <FallbackGlyph className={className} color={color} strokeWidth={strokeWidth} />}
    />
  );
}
