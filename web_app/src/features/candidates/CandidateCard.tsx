import React from 'react'
import type { CandidateAssets } from '../../core/types'

export interface CandidateCardProps {
  candidate: CandidateAssets
  isSelected: boolean
  onSelect: () => void
  className?: string
  style?: React.CSSProperties
}

export const CandidateCard: React.FC<CandidateCardProps> = ({
  candidate,
  isSelected,
  onSelect,
  className = '',
  style,
}) => {
  const { meta, urls } = candidate
  const scorePercent = (meta.score * 100).toFixed(1)
  const thumbUrl = urls.overlay || urls.cutout || urls.mask

  const [x1, y1, x2, y2] = meta.bbox_xyxy_px
  const w = Math.round(Math.abs(x2 - x1))
  const h = Math.round(Math.abs(y2 - y1))
  const areaK = (meta.mask_area_px / 1000).toFixed(1)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`app-candidate-card ${isSelected ? 'selected' : ''} ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '136px',
        height: '116px',
        padding: '6px',
        borderRadius: 'var(--radius-sm)',
        background: isSelected ? 'var(--bg-surface-selected)' : 'var(--bg-canvas)',
        border: `1.5px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
        boxShadow: isSelected ? '0 0 0 2px var(--accent-subtle), var(--shadow-sm)' : 'none',
        cursor: 'pointer',
        textAlign: 'left',
        flexShrink: 0,
        position: 'relative',
        transition: 'all var(--transition-fast)',
        ...style,
      }}
    >
      {/* Thumbnail area */}
      <div
        style={{
          width: '100%',
          height: '62px',
          borderRadius: 'var(--radius-xs)',
          overflow: 'hidden',
          background: 'var(--bg-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={`Candidate #${meta.id}`}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>No preview</div>
        )}

        {/* Candidate ID badge */}
        <span
          style={{
            position: 'absolute',
            top: '3px',
            left: '3px',
            padding: '1px 4px',
            borderRadius: '2px',
            background: 'rgba(0, 0, 0, 0.75)',
            color: 'var(--text-primary)',
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
          }}
        >
          #{meta.id}
        </span>

        {/* Score badge */}
        <span
          className="tabular-nums"
          style={{
            position: 'absolute',
            top: '3px',
            right: '3px',
            padding: '1px 4px',
            borderRadius: '2px',
            background: meta.score >= 0.8 ? 'var(--status-green-bg)' : 'rgba(0, 0, 0, 0.75)',
            border: meta.score >= 0.8 ? '1px solid var(--status-green-border)' : 'none',
            color: meta.score >= 0.8 ? 'var(--status-green)' : 'var(--text-primary)',
            fontSize: '9px',
            fontWeight: 600,
          }}
        >
          {scorePercent}%
        </span>
      </div>

      {/* Meta Specs */}
      <div style={{ marginTop: '5px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div
          className="tabular-nums"
          style={{
            fontSize: '10px',
            color: 'var(--text-secondary)',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {w} × {h} px
        </div>
        <div
          className="tabular-nums"
          style={{ fontSize: '9px', color: 'var(--text-muted)' }}
        >
          Diện tích: {areaK}k px
        </div>
      </div>
    </button>
  )
}
