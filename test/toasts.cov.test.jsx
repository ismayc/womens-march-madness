import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Toasts from '../src/components/Toasts.jsx'

// Two real committed teams so the logos resolve; the phrasing is what these tests pin.
const game = { id: 'g1', home: 'MICH', away: 'CONN', score: [88, 88] }
const evt = (over) => ({ id: 'g1', game, key: 'k1', ...over })

describe('Toasts — uncovered describe arms', () => {
  it('falls back to a neutral bullet for an unrecognized moment kind', () => {
    // The switch default arm (no icon/label/text) — hit by a kind the feed never emits.
    const { container } = render(<Toasts events={[evt({ kind: 'mystery' })]} />)
    const toast = container.querySelector('.toast-mystery')
    expect(toast).toBeTruthy()
    expect(toast.querySelector('.toast-icon').textContent).toBe('•')
    // Label and text are empty for the default arm.
    expect(toast.querySelector('.toast-label').textContent).toBe('')
    expect(toast.querySelector('.toast-teams').textContent.trim()).toBe('')
  })

  it('phrases a tied final as plain "Final"', () => {
    // The `leader === 'tie'` arm of the final case — no winner, no score line.
    const { container } = render(<Toasts events={[evt({ kind: 'final', leader: 'tie' })]} />)
    // Both the label and the teams line read "Final" (no winner-first score).
    expect(container.querySelector('.toast-teams').textContent.trim()).toBe('Final')
  })
})
