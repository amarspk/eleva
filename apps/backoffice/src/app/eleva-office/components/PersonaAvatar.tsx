'use client';

import React from 'react';

export type ElevaPersona = 'ELEVA';

export interface PersonaAvatarProps {
  persona?: ElevaPersona | string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function PersonaAvatar({ persona = 'ELEVA', size = 'md', className = '' }: PersonaAvatarProps): React.ReactElement {
  const sizeClasses: Record<string, string> = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-base',
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white shadow-md ${sizeClasses[size]} ${className}`}
      aria-hidden="true"
      title={`${persona} executive assistant`}
    >
      <span className="font-bold tracking-wide">{persona}</span>
      <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-3 w-3 rounded-full border-2 border-white bg-green-400" aria-label="online" />
    </div>
  );
}

export function ElevaPersonaBadge({ persona = 'ELEVA', className = '' }: { persona?: ElevaPersona | string; className?: string }): React.ReactElement {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-medium text-purple-800 ${className}`}>
      <PersonaAvatar persona={persona} size="sm" />
      <span>{persona} Executive Assistant</span>
    </span>
  );
}

export default PersonaAvatar;
