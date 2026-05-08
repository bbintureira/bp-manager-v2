import { useContext } from 'react'
import {
  SearchContext,
  type SearchContextValue,
} from '@/contexts/SearchContext'

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext)
  if (!ctx) {
    throw new Error('useSearch must be used inside <SearchProvider>')
  }
  return ctx
}

/**
 * Helper for case-insensitive substring matching against a query.
 * Empty query → matches everything. Useful inline in `.filter(...)`.
 */
export function matchesQuery(haystack: string, query: string): boolean {
  if (!query.trim()) return true
  return haystack.toLowerCase().includes(query.trim().toLowerCase())
}
