import { forwardRef } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import { cn } from '../utils/cn'

interface Props {
  value: string
  onChange: (v: string) => void
  className?: string
  autoFocus?: boolean
}

export const Search = forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, className, autoFocus }, ref) => (
    <div className={cn('relative w-44 md:w-56', className)}>
      <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-cyan-500/50" />
      <input
        ref={ref}
        type="search"
        placeholder="搜索节点…"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full pl-8 pr-3 py-1.5 text-sm font-mono bg-black/30 border border-cyan-500/20 rounded text-cyan-100 placeholder:text-cyan-700/50 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 transition-all"
        autoFocus={autoFocus}
      />
    </div>
  ),
)
Search.displayName = 'Search'
