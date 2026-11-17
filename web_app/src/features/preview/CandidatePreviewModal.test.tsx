import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CandidatePreviewModal } from './CandidatePreviewModal'
import { useAppStore } from '../../state/store'
import { initializeMockStore, createMockSegmentResult } from '../../dev/mockStore'

describe('CandidatePreviewModal', () => {
  beforeEach(() => {
    initializeMockStore()
    useAppStore.setState({
      result: createMockSegmentResult(),
      selectedCandidateId: 0,
    })
  })

  it('renders candidate specs and switches tabs', () => {
    const onClose = vi.fn()
    render(<CandidatePreviewModal isOpen={true} onClose={onClose} />)

    expect(screen.getByText(/Candidate #0/i)).toBeInTheDocument()
    expect(screen.getByText(/94.2%/i)).toBeInTheDocument()

    const maskTab = screen.getByRole('tab', { name: /Mặt nạ \(Mask\)/i })
    fireEvent.click(maskTab)
    expect(maskTab).toHaveAttribute('aria-selected', 'true')
  })

  it('switches background mode between checker and dark', () => {
    render(<CandidatePreviewModal isOpen={true} onClose={() => {}} />)

    const darkBgRadio = screen.getByRole('radio', { name: /Nền tối/i })
    fireEvent.click(darkBgRadio)
    expect(darkBgRadio).toHaveAttribute('aria-checked', 'true')
  })
})
