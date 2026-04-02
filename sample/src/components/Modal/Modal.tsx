import React from 'react';
import styles from './Modal.module.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}

export const Modal = ({ isOpen, onClose, children, title }: ModalProps) => {
  if (!isOpen) return null;
  return (
    <div className={`${styles.backdrop} ${styles['backdrop--blur']}`} onClick={onClose}>
      <div
        className={styles.modal}
        style={{ zIndex: 1000, padding: '24px 32px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modal__header}>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button className={styles['modal__close-btn']} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modal__body}>{children}</div>
      </div>
    </div>
  );
};
