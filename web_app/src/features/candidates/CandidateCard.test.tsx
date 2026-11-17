import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CandidateCard } from './CandidateCard'
import { createMockCandidates } from '../../dev/mockStore'

describe('CandidateCard', () => {
  it('renders score percentage, dimensions, and responds to click', () => {
    const candidate = createMockCandidates()[0]
    const onSelect = vi.fn()

    render(<CandidateCard candidate={candidate} isSelected={false} onSelect={onSelect} />)

    expect(screen.getByText('#0')).toBeInTheDocument()
    expect(screen.getByText('94.2%')).toBeInTheDocument()
    expect(screen.getByText('480 × 460 px')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
