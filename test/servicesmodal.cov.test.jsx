import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ServicesModal from '../src/components/ServicesModal.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

beforeEach(() => localStorage.clear())

describe('ServicesModal', () => {
  const open = (onClose) =>
    render(
      <ServicesProvider>
        <ServicesModal onClose={onClose} />
      </ServicesProvider>
    )

  it('closes when the backdrop itself (not the dialog) is clicked', () => {
    const onClose = vi.fn()
    const { container } = open(onClose)
    // Mouse-down on the wrapper where target === currentTarget -> the close arm fires.
    fireEvent.mouseDown(container.querySelector('.modal-wrap'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT close when the dialog body is clicked', () => {
    const onClose = vi.fn()
    open(onClose)
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes from the ✕ button', () => {
    const onClose = vi.fn()
    open(onClose)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
