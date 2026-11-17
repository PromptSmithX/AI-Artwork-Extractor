import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { CandidateStrip } from './CandidateStrip'
import { useAppStore } from '../../state/store'
import { initializeMockStore, createMockSegmentResult } from '../../dev/mockStore'

describe('CandidateStrip', () => {
  beforeEach(() => {
    initializeMockStore()
  })

  it('renders zero candidates empty state when result has 0 candidates', () => {
    useAppStore.setState({ result: createMockSegmentResult([]) })
    render(<CandidateStrip />)

    expect(screen.getByText(/0 candidate tìm thấy/i)).toBeInTheDocument()
    expect(screen.getByText(/Hạ ngưỡng tự tin/i)).toBeInTheDocument()
  })

  it('navigates candidates using keyboard arrow keys', () => {
    useAppStore.setState({
      result: createMockSegmentResult(),
      selectedCandidateId: null,
    })
    render(<CandidateStrip />)

    // Press ArrowRight to select first candidate
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(useAppStore.getState().selectedCandidateId).toBe(0)

    // Press ArrowRight to cycle to next candidate
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(useAppStore.getState().selectedCandidateId).toBe(1)
  })
})
