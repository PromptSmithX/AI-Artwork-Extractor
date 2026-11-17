import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SvgBoxOverlay } from './SvgBoxOverlay'

describe('SvgBoxOverlay', () => {
  it('renders box dimension readout in px', () => {
    const onBoxChange = vi.fn()
    render(
      <SvgBoxOverlay
        displayWidth={600}
        displayHeight={450}
        naturalWidth={1200}
        naturalHeight={900}
        scale={0.5}
        mode="text_box"
        box={{ x1: 300, y1: 200, x2: 780, y2: 660 }}
        onBoxChange={onBoxChange}
      />,
    )

    expect(screen.getByText('480 × 460 px')).toBeInTheDocument()
  })

  it('clears box on Escape key', () => {
    const onBoxChange = vi.fn()
    render(
      <SvgBoxOverlay
        displayWidth={600}
        displayHeight={450}
        naturalWidth={1200}
        naturalHeight={900}
        scale={0.5}
        mode="text_box"
        box={{ x1: 300, y1: 200, x2: 780, y2: 660 }}
        onBoxChange={onBoxChange}
      />,
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onBoxChange).toHaveBeenCalledWith(null)
  })
})
