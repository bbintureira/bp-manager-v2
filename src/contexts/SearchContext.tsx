import {
  createContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'

export interface SearchContextValue {
  query: string
  setQuery: (q: string) => void
}

export const SearchContext = createContext<SearchContextValue | null>(null)

/**
 * Holds the topbar search query so any page rendered inside this layout
 * can read it via `useSearch()` and filter its data.
 *
 * The query auto-clears whenever:
 *   - The route's pathname changes (navigation between pages).
 *   - The URL search params change (drill-in within a page, e.g. picking
 *     a project on Asignaciones via `?p=<id>`).
 * "Click the same nav item" (no URL change) is handled separately by
 * the Sidebar via an explicit setQuery('') in the NavLink onClick.
 */
export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('')
  const location = useLocation()

  useEffect(() => {
    setQuery('')
  }, [location.pathname, location.search])

  const value = useMemo<SearchContextValue>(
    () => ({ query, setQuery }),
    [query]
  )
  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  )
}
