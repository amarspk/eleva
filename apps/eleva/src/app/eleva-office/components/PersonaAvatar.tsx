'use client';

import React from 'react';

type PersonaAvatarSize = 'sm' | 'md';

const SIZE_CLASSES: Record<PersonaAvatarSize, string> = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
};

export default function PersonaAvatar({
  persona,
  size = 'md',
  className,
}: {
  persona: string;
  size?: PersonaAvatarSize;
  className?: string;
}): React.ReactElement {
  const initials = persona
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'E';

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border border-gold-500/40 bg-luxury-elevated text-gold-300 ${SIZE_CLASSES[size]} ${className ?? ''}`}
      aria-label={`${persona} avatar`}
    >
      {initials}
    </span>
  );
}

export function ElevaPersonaBadge({ persona }: { persona: string }): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-luxury-border bg-luxury-elevated px-3 py-1.5 text-xs text-gold-200">
      <span className="inline-flex h-2 w-2 rounded-full bg-gold-400" aria-hidden="true" />
      {persona || 'ELEVA'}
    </span>
  );
}
