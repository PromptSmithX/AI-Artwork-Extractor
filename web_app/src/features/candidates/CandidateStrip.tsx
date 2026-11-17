import React, { useEffect, useRef } from 'react'
import { useAppStore } from '../../state/store'
import { CandidateCard } from './CandidateCard'
import { ZeroCandidates } from './ZeroCandidates'
import { Kbd } from '../../components/Kbd'

export interface CandidateStripProps {
  onOpenPreview?: () => void
  className?: string
  style?: React.CSSProperties
}

export const CandidateStrip: React.FC<CandidateStripProps> = ({
  onOpenPreview,
  className = '',
  style,
}) => {
  const result = useAppStore((s) => s.result)
  const selectedCandidateId = useAppStore((s) => s.selectedCandidateId)
  const selectCandidate = useAppStore((s) => s.selectCandidate)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const candidates = result?.candidates || []
  const hasCandidates = candidates.length > 0
  const isZeroCandidates = result !== null && candidates.length === 0
  const candidateIds = candidates.map((c) => c.meta.id)
  const candidateIdsRef = useRef(candidateIds)

  useEffect(() => {
    candidateIdsRef.current = candidateIds
  }, [candidateIds])

  // Keyboard navigation: ArrowLeft / ArrowRight to cycle candidates
  useEffect(() => {
    if (!hasCandidates) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when inside inputs
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
      const ids = candidateIdsRef.current
      if (ids.length === 0) return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (selectedCandidateId === null) {
          selectCandidate(ids[0])
        } else {
          const currentIndex = ids.indexOf(selectedCandidateId)
          const prevIndex = (currentIndex - 1 + ids.length) % ids.length
          selectCandidate(ids[prevIndex])
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (selectedCandidateId === null) {
          selectCandidate(ids[0])
        } else {
          const currentIndex = ids.indexOf(selectedCandidateId)
          const nextIndex = (currentIndex + 1) % ids.length
          selectCandidate(ids[nextIndex])
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasCandidates, selectedCandidateId, selectCandidate])

  if (!result) return null

  return (
    <section
      className={`app-candidate-strip ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '150px',
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border-subtle)',
        flexShrink: 0,
        overflow: 'hidden',
        userSelect: 'none',
        ...style,
      }}
    >
      {/* Strip Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 14px',
          background: 'var(--bg-panel-header)',
          borderBottom: '1px solid var(--border-subtle)',
          fontSize: '11px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            KẾT QUẢ PHÂN ĐOẠN (CANDIDATES)
          </span>
          <span
            className="tabular-nums"
            style={{
              padding: '1px 6px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontWeight: 600,
            }}
          >
            {candidates.length}
          </span>
          {result.metadata.elapsed_ms > 0 && (
            <span style={{ color: 'var(--text-muted)' }}>
              ({(result.metadata.elapsed_ms / 1000).toFixed(2)}s)
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span>Chọn candidate:</span>
            <Kbd>←</Kbd>
            <Kbd>→</Kbd>
          </span>
          {selectedCandidateId !== null && onOpenPreview && (
            <button
              type="button"
              onClick={onOpenPreview}
              style={{
                color: 'var(--accent-primary)',
                fontWeight: 600,
                cursor: 'pointer',
                marginLeft: '8px',
              }}
            >
              Mở kiểm tra chi tiết ↗
            </button>
          )}
        </div>
      </header>

      {/* Strip Content */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 14px',
          overflowX: 'auto',
          overflowY: 'hidden',
        }}
      >
        {isZeroCandidates && <ZeroCandidates />}

        {candidates.map((c) => {
          const isSelected = c.meta.id === selectedCandidateId
          return (
            <CandidateCard
              key={c.meta.id}
              candidate={c}
              isSelected={isSelected}
              onSelect={() => {
                selectCandidate(c.meta.id)
                if (onOpenPreview) onOpenPreview()
              }}
            />
          )
        })}
      </div>
    </section>
  )
}
