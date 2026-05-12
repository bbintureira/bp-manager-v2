import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface DataTableColumn<T> {
  /**
   * Unique React key for this column (used for both <th> and the cells in
   * each row). Must be unique within the `columns` array — duplicates
   * trigger React's "each child should have a unique key" warning.
   */
  key: string
  /**
   * Optional accessor used to read a value from the row. If omitted, the
   * column is render-only (only `render` is called and gets `undefined`
   * as the first arg).
   */
  accessor?: keyof T
  header: ReactNode
  align?: 'left' | 'right'
  /** Render numbers with mono + tabular-nums + right alignment. */
  numeric?: boolean
  width?: string | number
  render?: (value: T[keyof T] | undefined, row: T) => ReactNode
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  onRowClick?: (row: T) => void
  className?: string
  /** Stable key getter; default uses array index. */
  rowKey?: (row: T, idx: number) => string | number
  empty?: ReactNode
  /** Optional totals row. Each entry's cell renders under its column; keys
   *  omitted from the map render as blank cells. Rendered as a bold,
   *  border-top tfoot row. */
  footer?: Partial<Record<string, ReactNode>>
}

/**
 * Dense table for lists. Numeric columns get mono + tnum + right-align.
 * If `accessor` is set, the row's field is passed to `render`; otherwise
 * the column is render-only (typical for derived/computed cells).
 */
export function DataTable<T>({
  columns,
  data,
  onRowClick,
  className,
  rowKey,
  empty,
  footer,
}: DataTableProps<T>) {
  const clickable = Boolean(onRowClick)
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full border-collapse text-xl table-auto">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  'bg-base border-b border-border',
                  'px-5 py-2.5 text-2xs font-medium uppercase tracking-wider text-tertiary',
                  col.align === 'right' || col.numeric
                    ? 'text-right'
                    : 'text-left'
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 && empty && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-5 py-10 text-center text-tertiary text-sm"
              >
                {empty}
              </td>
            </tr>
          )}
          {data.map((row, i) => (
            <tr
              key={rowKey ? rowKey(row, i) : i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-b border-border last:border-0 transition-colors',
                clickable && 'cursor-pointer hover:bg-hover'
              )}
            >
              {columns.map((col) => {
                const v =
                  col.accessor !== undefined ? row[col.accessor] : undefined
                const content = col.render
                  ? col.render(v, row)
                  : (v as ReactNode)
                return (
                  <td
                    key={col.key}
                    className={cn(
                      'px-5 py-4 text-xl text-primary align-middle',
                      col.align === 'right' || col.numeric
                        ? 'text-right'
                        : 'text-left',
                      col.numeric && 'font-mono tabular-nums'
                    )}
                  >
                    {content}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr className="border-t-2 border-border-strong">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-5 py-3 text-xl font-semibold text-primary align-middle bg-base',
                    col.align === 'right' || col.numeric
                      ? 'text-right'
                      : 'text-left',
                    col.numeric && 'font-mono tabular-nums'
                  )}
                >
                  {footer[col.key] ?? null}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
