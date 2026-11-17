import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ConnectionModal } from './ConnectionModal'
import { useAppStore } from '../../state/store'
import { initializeMockStore } from '../../dev/mockStore'

describe('ConnectionModal', () => {
  beforeEach(() => {
    initializeMockStore()
  })

  it('renders connection inputs and toggles token visibility', () => {
    const onClose = vi.fn()
    render(<ConnectionModal isOpen={true} onClose={onClose} />)

    const tokenInput = screen.getByPlaceholderText(/Nhập secret token/i)
    expect(tokenInput).toHaveAttribute('type', 'password')

    const revealBtn = screen.getByTitle('Hiện token')
    fireEvent.click(revealBtn)
    expect(tokenInput).toHaveAttribute('type', 'text')
  })

  it('saves new connection settings when clicking save and test', () => {
    render(<ConnectionModal isOpen={true} onClose={() => {}} />)

    const urlInput = screen.getByPlaceholderText(/https:\/\/random-words\.trycloudflare\.com/i)
    fireEvent.change(urlInput, { target: { value: 'https://new-tunnel.trycloudflare.com' } })

    const saveBtn = screen.getByRole('button', { name: /Lưu & Kiểm tra kết nối/i })
    fireEvent.click(saveBtn)

    expect(useAppStore.getState().connection.baseUrl).toBe('https://new-tunnel.trycloudflare.com')
  })
})
