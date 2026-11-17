import React, { useState } from 'react'
import type { CandidateFileKey } from '../../core/types'
import { useAppStore } from '../../state/store'
import { Button } from '../../components/Button'
import { getFullCutoutBlob } from './cutoutHelper'

export interface ExportPanelProps {
  className?: string
  style?: React.CSSProperties
}

export const ExportPanel: React.FC<ExportPanelProps> = ({ className = '', style }) => {
  const result = useAppStore((s) => s.result)
  const image = useAppStore((s) => s.image)
  const selectedCandidateId = useAppStore((s) => s.selectedCandidateId)
  const [isBuildingFull, setIsBuildingFull] = useState(false)

  if (!result) return null

  const selectedCandidate = result.candidates.find((c) => c.meta.id === selectedCandidateId)
  const baseName = image ? image.file.name.replace(/\.[^/.]+$/, '') : 'artwork'

  const downloadFile = (blobOrUrl: Blob | string | undefined, filename: string) => {
    if (!blobOrUrl) return
    const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    if (typeof blobOrUrl !== 'string') {
      URL.revokeObjectURL(url)
    }
  }

  const handleDownloadCandidateAsset = (key: CandidateFileKey) => {
    if (!selectedCandidate) return
    const blob = selectedCandidate.blobs[key]
    const url = selectedCandidate.urls[key]
    const padId = String(selectedCandidate.meta.id).padStart(2, '0')
    const filename = `${baseName}_cand${padId}_${key}.png`
    downloadFile(blob || url, filename)
  }

  const handleDownloadFullCutout = async () => {
    if (!selectedCandidate) return
    setIsBuildingFull(true)
    try {
      const blob = await getFullCutoutBlob(selectedCandidate)
      if (blob) {
        const padId = String(selectedCandidate.meta.id).padStart(2, '0')
        downloadFile(blob, `${baseName}_cand${padId}_cutout_full.png`)
      }
    } finally {
      setIsBuildingFull(false)
    }
  }

  const handleDownloadZip = () => {
    if (!result.zipBlob) return
    downloadFile(result.zipBlob, `${baseName}_sam3_results.zip`)
  }

  return (
    <div
      className={`app-export-panel ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '12px',
        background: 'var(--bg-canvas)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        fontSize: '12px',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          XUẤT FILE (EXPORT)
        </span>
        {selectedCandidate ? (
          <span style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 500 }}>
            Đang chọn #{selectedCandidate.meta.id}
          </span>
        ) : (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Chưa chọn candidate
          </span>
        )}
      </div>

      {selectedCandidate ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              handleDownloadCandidateAsset(
                selectedCandidate.urls.cutout_crop ? 'cutout_crop' : 'cutout',
              )
            }
          >
            Cutout PNG (crop)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={isBuildingFull}
            onClick={handleDownloadFullCutout}
          >
            Full Cutout PNG
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleDownloadCandidateAsset('mask')}
          >
            Tải Mask PNG
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownloadZip}
          >
            Tải File ZIP
          </Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Chọn 1 candidate ở thanh dưới để tải ảnh PNG trong suốt hoặc tải toàn bộ kết quả ZIP.
          </div>
          <Button variant="secondary" size="sm" onClick={handleDownloadZip}>
            Tải toàn bộ kết quả (ZIP)
          </Button>
        </div>
      )}
    </div>
  )
}
