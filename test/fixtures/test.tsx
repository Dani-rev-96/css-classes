import React from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

interface CardProps {
  featured?: boolean;
  compact?: boolean;
  title: string;
  children: React.ReactNode;
}

export function Card({ featured, compact, title, children }: CardProps) {
  return (
    <div
      className={clsx(
        'card',
        { 'card--featured': featured, 'card--compact': compact }
      )}
    >
      <div className="card__header">
        <h2 className="text-center">{title}</h2>
      </div>
      <div className="card__body">
        {children}
      </div>
      <div className="card__footer">
        <button className={`btn ${featured ? 'active' : ''}`}>
          Action
        </button>
      </div>
    </div>
  );
}

export function NavItem({ active, disabled, label, href }: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className={clsx('nav__item', {
        'nav__item--active': active,
        'nav__item--disabled': disabled,
      })}
    >
      <span className={styles.icon}>●</span>
      <span className={styles['item-label']}>{label}</span>
    </a>
  );
}
