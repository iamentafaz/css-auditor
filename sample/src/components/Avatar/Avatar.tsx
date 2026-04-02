import React from 'react';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  src?: string;
}

const SIZE_CLASSES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
};

export const Avatar = ({ name, size = 'md', src }: AvatarProps) => {
  const initials = name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  if (src) {
    return <img src={src} alt={name} className={`${SIZE_CLASSES[size]} rounded-full object-cover`} />;
  }
  return (
    <div className={`${SIZE_CLASSES[size]} rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-medium`}>
      {initials}
    </div>
  );
};
