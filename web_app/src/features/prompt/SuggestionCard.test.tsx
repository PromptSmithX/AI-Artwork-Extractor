import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { SuggestionCard } from './SuggestionCard'
import { useAppStore } from '../../state/store'
import { initializeMockStore, SAMPLE_SUGGESTION } from '../../dev/mockStore'

describe('SuggestionCard', () => {
  beforeEach(() => {
    initializeMockStore()
    useAppStore.setState({ suggestion: SAMPLE_SUGGESTION })
  })

  it('renders target description, scope badge and reason', () => {
    render(<SuggestionCard />)
    expect(screen.getByText('Toàn bộ patch')).toBeInTheDocument()
    expect(screen.getByText(SAMPLE_SUGGESTION.target_description)).toBeInTheDocument()
    expect(screen.getByText(/chest area, left side/i)).toBeInTheDocument()
  })

  it('clicking an alternative chip updates the store prompt', () => {
    render(<SuggestionCard />)
    const chip = screen.getByRole('button', { name: /square embroidered badge/i })
    expect(chip).toBeInTheDocument()

    fireEvent.click(chip)
    expect(useAppStore.getState().prompt).toBe('square embroidered badge')
  })
})
