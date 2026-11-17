import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { ModeSelector } from './ModeSelector'
import { useAppStore } from '../../state/store'
import { initializeMockStore } from '../../dev/mockStore'

describe('ModeSelector', () => {
  beforeEach(() => {
    initializeMockStore()
  })

  it('renders mode options and switches mode', () => {
    render(<ModeSelector />)
    const boxRadio = screen.getByRole('radio', { name: /Box \(B\)/i })
    expect(boxRadio).toBeInTheDocument()

    fireEvent.click(boxRadio)
    expect(useAppStore.getState().mode).toBe('box')

    const textBoxRadio = screen.getByRole('radio', { name: /Text \+ Box/i })
    fireEvent.click(textBoxRadio)
    expect(useAppStore.getState().mode).toBe('text_box')
  })
})
