import { useState, useEffect } from 'react'
import { ToastProvider } from './components/Toast'
import { useToast } from './components/useToast'
import { ConnectionStatus, ConnectionModal } from './features/connection'
import { UploadDropzone, ImageInfo } from './features/upload'
import { CanvasArea } from './features/canvas'
import {
  ModeSelector,
  ThresholdSlider,
  PromptAssistant,
  SuggestionCard,
  SamPromptInput,
  RunButton,
} from './features/prompt'
import { CandidateStrip } from './features/candidates'
import { CandidatePreviewModal } from './features/preview'
import { ExportPanel } from './features/export'
import { ShortcutsModal, useGlobalShortcuts } from './features/shortcuts'
import { useAppStore } from './state/store'
import { initializeMockStore, setPresetState } from './dev/mockStore'

function MainLayout() {
  const image = useAppStore((s) => s.image)
  const result = useAppStore((s) => s.result)
  const selectedCandidateId = useAppStore((s) => s.selectedCandidateId)
  const healthError = useAppStore((s) => s.healthError)
  const { showApiErrorToast } = useToast()

  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(() => {
    return new URLSearchParams(window.location.search).get('preset') === 'results'
  })
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  // Global keyboard shortcuts
  useGlobalShortcuts({
    onOpenShortcuts: () => setIsShortcutsModalOpen(true),
  })

  // Show error toast if health error occurs
  useEffect(() => {
    if (healthError) {
      showApiErrorToast(healthError.kind, healthError.detail)
    }
  }, [healthError, showApiErrorToast])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-app)',
      }}
    >
      {/* Top Application Bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          height: '46px',
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
          userSelect: 'none',
          zIndex: 100,
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, var(--accent-primary) 0%, #3b82f6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '13px',
              boxShadow: '0 2px 6px rgba(99, 102, 241, 0.4)',
            }}
          >
            A
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: '13px',
                letterSpacing: '-0.01em',
                color: 'var(--text-primary)',
              }}
            >
              AI Artwork Extractor
            </span>
            <span
              style={{
                fontSize: '9px',
                color: 'var(--text-muted)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Creative Studio · SAM 3 + Qwen
            </span>
          </div>
        </div>

        {/* Center: Dev Preset Switcher (allows designer/reviewer to inspect any state instantly) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--bg-canvas)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)' }}>
            DEMO PRESET:
          </span>
          <select
            onChange={(e) => setPresetState(e.target.value as any)}
            defaultValue="empty"
            style={{
              fontSize: '11px',
              background: 'transparent',
              border: 'none',
              color: 'var(--accent-primary)',
              cursor: 'pointer',
              fontWeight: 600,
              padding: '2px 4px',
            }}
          >
            <option value="empty">1. Empty State (Chưa có ảnh)</option>
            <option value="loaded">2. Image Loaded + Box Drawn</option>
            <option value="assistant_ready">3. Qwen Suggestion Card</option>
            <option value="segmenting">4. Running SAM 3 (Loading)</option>
            <option value="results">5. Candidates Strip &amp; Preview</option>
            <option value="zero_candidates">6. 0 Candidates Found</option>
            <option value="error">7. Connection Error Toast</option>
          </select>
        </div>

        {/* Right Top Bar Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ConnectionStatus onOpenSettings={() => setIsConnectionModalOpen(true)} />

          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
            aria-label="Đổi theme"
            style={{
              padding: '5px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            {theme === 'dark' ? '☀️ Sáng' : '🌙 Tối'}
          </button>

          <button
            type="button"
            onClick={() => setIsShortcutsModalOpen(true)}
            title="Phím tắt (?)"
            aria-label="Phím tắt"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              fontWeight: 'bold',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            ?
          </button>
        </div>
      </header>

      {/* Main Center Area: Left Panel, Center Canvas, Right Panel */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Left Control Panel */}
        <aside
          style={{
            width: '290px',
            background: 'var(--bg-panel)',
            borderRight: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            padding: '14px',
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          {/* Upload / Image Info */}
          {image ? <ImageInfo /> : <UploadDropzone />}

          {/* Mode Selector */}
          <ModeSelector />

          {/* Confidence Slider */}
          <ThresholdSlider />

          {/* Export Panel (Visible when results exist) */}
          {result && <ExportPanel />}
        </aside>

        {/* Center Interactive Canvas */}
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            height: '100%',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <CanvasArea />
        </main>

        {/* Right Prompt Assistant & SAM Panel */}
        <aside
          style={{
            width: '350px',
            background: 'var(--bg-panel)',
            borderLeft: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '14px',
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          <PromptAssistant />

          <SuggestionCard />

          <SamPromptInput />

          <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
            <RunButton />
          </div>
        </aside>
      </div>

      {/* Bottom Candidate Strip */}
      <CandidateStrip onOpenPreview={() => setIsPreviewModalOpen(true)} />

      {/* Modals */}
      <ConnectionModal
        isOpen={isConnectionModalOpen}
        onClose={() => setIsConnectionModalOpen(false)}
      />

      <CandidatePreviewModal
        isOpen={isPreviewModalOpen && selectedCandidateId !== null}
        onClose={() => setIsPreviewModalOpen(false)}
      />

      <ShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />
    </div>
  )
}

export default function App() {
  useEffect(() => {
    // Initialize dev mock actions so UI functions work right away
    initializeMockStore()

    const params = new URLSearchParams(window.location.search)
    const preset = params.get('preset')
    if (preset) {
      setPresetState(preset as any)
    }
  }, [])

  return (
    <ToastProvider>
      <MainLayout />
    </ToastProvider>
  )
}
