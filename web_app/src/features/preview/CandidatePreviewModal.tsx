import React, { useState } from 'react'
import type { CandidateFileKey } from '../../core/types'
import { useAppStore } from '../../state/store'
import { Modal } from '../../components/Modal'
import { Tabs } from '../../components/Tabs'
import { Button } from '../../components/Button'
import { BackgroundToggle, type PreviewBackground } from './BackgroundToggle'
import { CompareSlider } from './CompareSlider'

export interface CandidatePreviewModalProps {
  isOpen: boolean
  onClose: () => void
}

type PreviewTab = 'transparent' | 'overlay' | 'mask' | 'original' | 'compare'

export const CandidatePreviewModal: React.FC<CandidatePreviewModalProps> = ({
  isOpen,
  onClose,
}) => {
  const result = useAppStore((s) => s.result)
  const image = useAppStore((s) => s.image)
  const selectedCandidateId = useAppStore((s) => s.selectedCandidateId)

  const [activeTab, setActiveTab] = useState<PreviewTab>('transparent')
  const [bgMode, setBgMode] = useState<PreviewBackground>('checker')
  const [isBuildingFull, setIsBuildingFull] = useState(false)

  if (!result || selectedCandidateId === null) return null

  const candidate = result.candidates.find((c) => c.meta.id === selectedCandidateId)
  if (!candidate) return null

  const { meta, urls, blobs } = candidate
  const [x1, y1, x2, y2] = meta.bbox_xyxy_px
  const w = Math.round(Math.abs(x2 - x1))
  const h = Math.round(Math.abs(y2 - y1))
  const areaK = (meta.mask_area_px / 1000).toFixed(1)

  // Download helper for assets
  const handleDownload = (key: CandidateFileKey) => {
    const url = urls[key]
    const blob = blobs[key]
    if (!url && !blob) return

    const baseName = image ? image.file.name.replace(/\.[^/.]+$/, '') : 'artwork'
    const padId = String(meta.id).padStart(2, '0')
    const filename = `${baseName}_cand${padId}_${key}.png`

    const link = document.createElement('a')
    link.href = url || (blob ? URL.createObjectURL(blob) : '')
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleDownloadFullCutout = async () => {
    setIsBuildingFull(true)
    try {
      const getFullCutoutBlob = useAppStore.getState().getFullCutoutBlob
      const blob = await getFullCutoutBlob(candidate.meta.id)
      if (blob) {
        const baseName = image ? image.file.name.replace(/\.[^/.]+$/, '') : 'artwork'
        const padId = String(meta.id).padStart(2, '0')
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.href = url
        link.download = `${baseName}_cand${padId}_cutout_full.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }
    } finally {
      setIsBuildingFull(false)
    }
  }

  const canBuildFull = Boolean(
    candidate.blobs.cutout ||
      (candidate.blobs.cutout_crop && candidate.meta.crop_box_xyxy_px),
  )

  // Get current image url based on tab
  const getTabUrl = (): string | undefined => {
    switch (activeTab) {
      case 'transparent':
        return urls.cutout_crop || urls.cutout
      case 'overlay':
        return urls.overlay
      case 'mask':
        return urls.mask
      case 'original':
        return image?.url
      default:
        return urls.cutout_crop || urls.cutout
    }
  }

  const currentUrl = getTabUrl()

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      width="92vw"
      maxWidth="860px"
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>Candidate #{meta.id}</span>
          <span
            className="tabular-nums"
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--status-green-bg)',
              border: '1px solid var(--status-green-border)',
              color: 'var(--status-green)',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            Độ khớp: {(meta.score * 100).toFixed(1)}%
          </span>
          <span className="tabular-nums" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {w} × {h} px · {areaK}k px
          </span>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Top Controls Bar: Tabs & Background Toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-subtle)',
            paddingBottom: '8px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <Tabs<PreviewTab>
            activeTab={activeTab}
            onChange={setActiveTab}
            tabs={[
              { id: 'transparent', label: 'Tách nền (Transparent)' },
              { id: 'overlay', label: 'Lớp phủ (Overlay)' },
              { id: 'mask', label: 'Mặt nạ (Mask)' },
              { id: 'original', label: 'Ảnh gốc (Original)' },
              { id: 'compare', label: 'So sánh (Compare Slider)' },
            ]}
          />

          {/* Background toggle visible when viewing transparent or compare */}
          {(activeTab === 'transparent' || activeTab === 'compare') && (
            <BackgroundToggle value={bgMode} onChange={setBgMode} />
          )}
        </div>

        {/* Viewport Area */}
        <div
          style={{
            width: '100%',
            height: '420px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-default)',
            overflow: 'hidden',
          }}
        >
          {activeTab === 'compare' ? (
            <CompareSlider
              originalUrl={image?.url || ''}
              cutoutUrl={urls.cutout || urls.cutout_crop || ''}
              backgroundClass={bgMode === 'checker' ? 'checkerboard-pattern' : undefined}
              backgroundStyle={{
                backgroundColor:
                  bgMode === 'dark' ? '#121316' : bgMode === 'light' ? '#ffffff' : undefined,
              }}
            />
          ) : (
            <div
              className={
                activeTab === 'transparent' && bgMode === 'checker'
                  ? 'checkerboard-pattern'
                  : undefined
              }
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor:
                  activeTab === 'transparent'
                    ? bgMode === 'dark'
                      ? '#121316'
                      : bgMode === 'light'
                      ? '#ffffff'
                      : undefined
                    : 'var(--bg-canvas)',
              }}
            >
              {currentUrl ? (
                <img
                  src={currentUrl}
                  alt={`Candidate #${meta.id} ${activeTab}`}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    padding: '8px',
                  }}
                />
              ) : (
                <div style={{ color: 'var(--text-muted)' }}>Không có file ảnh này</div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Actions: Export Buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '12px',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Tọa độ hộp: [{x1}, {y1}, {x2}, {y2}]
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {urls.mask && (
              <Button variant="secondary" size="sm" onClick={() => handleDownload('mask')}>
                Tải Mask PNG
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              loading={isBuildingFull}
              disabled={!canBuildFull}
              title={canBuildFull ? 'Tải ảnh cutout đầy đủ kích thước gốc' : 'Không có dữ liệu crop box để tái tạo full cutout'}
              onClick={handleDownloadFullCutout}
            >
              Full-canvas cutout PNG
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleDownload(urls.cutout_crop ? 'cutout_crop' : 'cutout')}
            >
              Tải Cutout Crop PNG
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
