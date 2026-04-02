import React from 'react';
import styles from './DataTable.module.css';

interface Column { key: string; label: string; }
interface DataTableProps {
  columns: Column[];
  rows: Record<string, any>[];
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
}

export const DataTable = ({ columns, rows, onSort, sortKey, sortDir }: DataTableProps) => {
  return (
    <div className={styles['table-wrapper']}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={styles['table__th']}
                onClick={() => onSort?.(col.key, sortDir === 'asc' ? 'desc' : 'asc')}>
                {col.label}
                {sortKey === col.key && (
                  <span className={styles[`table__sort-icon--${sortDir}`]}>
                    {sortDir === 'asc' ? ' ↑' : ' ↓'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? styles['table__row--even'] : styles['table__row--odd']}>
              {columns.map((col) => (
                <td key={col.key} className={styles['table__td']}>{row[col.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
