import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { SamPromptInput } from './SamPromptInput'
import { useAppStore } from '../../state/store'
import { initializeMockStore } from '../../dev/mockStore'

describe('SamPromptInput', () => {
  beforeEach(() => {
    initializeMockStore()
  })

  it('allows typing English prompt without warning', () => {
    render(<SamPromptInput />)
    const input = screen.getByPlaceholderText(/ví dụ: embroidered patch/i)
    fireEvent.change(input, { target: { value: 'embroidered floral badge' } })

    expect(useAppStore.getState().prompt).toBe('embroidered floral badge')
    expect(screen.queryByText(/SAM 3 chỉ hiểu tiếng Anh/i)).not.toBeInTheDocument()
  })

  it('shows non-English warning when Vietnamese characters are entered', () => {
    render(<SamPromptInput />)
    const input = screen.getByPlaceholderText(/ví dụ: embroidered patch/i)
    fireEvent.change(input, { target: { value: 'hình bông hoa thêu' } })

    expect(screen.getByText(/SAM 3 chỉ hiểu tiếng Anh/i)).toBeInTheDocument()
  })
})
