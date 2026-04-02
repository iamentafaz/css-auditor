import React from 'react';
import styles from './Button.module.css';
import cn from 'clsx';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  isLoading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}

export const Button = ({ variant = 'primary', isLoading, disabled, children, onClick }: ButtonProps) => {
  return (
    <button
      className={cn(
        styles.btn,
        styles[`btn--${variant}`],
        isLoading && styles['btn--loading'],
      )}
      style={{ minWidth: '88px' }}
      disabled={disabled || isLoading}
      onClick={onClick}
    >
      {isLoading && <span className={styles['btn__spinner']} />}
      <span className="flex items-center gap-2 text-sm font-medium">{children}</span>
    </button>
  );
};
