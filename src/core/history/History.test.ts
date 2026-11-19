import { describe, expect, it, vi } from 'vitest'
import { History, type Command } from './History'

function command(log: string[], name: string, bytes = 0): Command & { dispose: () => void } {
  return {
    label: name,
    bytes,
    undo: () => log.push(`undo ${name}`),
    redo: () => log.push(`redo ${name}`),
    dispose: vi.fn(() => log.push(`dispose ${name}`)),
  }
}

describe('History', () => {
  it('undoes and redoes in order', () => {
    const log: string[] = []
    const history = new History()
    history.push(command(log, 'a'))
    history.push(command(log, 'b'))
    expect(history.store.getState()).toMatchObject({ canUndo: true, canRedo: false, undoLabel: 'b' })

    history.undo()
    history.undo()
    expect(history.undo()).toBe(false)
    history.redo()
    expect(log).toEqual(['undo b', 'undo a', 'redo a'])
    expect(history.store.getState()).toMatchObject({ undoLabel: 'a', redoLabel: 'b' })
  })

  it('drops the redo branch when a new command is pushed', () => {
    const log: string[] = []
    const history = new History()
    history.push(command(log, 'a'))
    history.push(command(log, 'b'))
    history.undo()
    history.push(command(log, 'c'))
    expect(log).toContain('dispose b')
    expect(history.store.getState().canRedo).toBe(false)
    expect(history.entries().map((c) => c.label)).toEqual(['a', 'c'])
  })

  it('evicts the oldest commands beyond the memory budget', () => {
    const log: string[] = []
    const history = new History({ maxBytes: 100 })
    const evicted = vi.fn()
    history.onEviction(evicted)
    history.push(command(log, 'a', 60))
    history.push(command(log, 'b', 60))
    expect(log).toContain('dispose a')
    expect(history.entries().map((c) => c.label)).toEqual(['b'])
    expect(evicted).toHaveBeenCalled()
  })

  it('always keeps the most recent command, even if it alone exceeds the budget', () => {
    const history = new History({ maxBytes: 10 })
    history.push(command([], 'huge', 1000))
    expect(history.store.getState().canUndo).toBe(true)
  })

  it('respects the entry cap and disposes everything on clear', () => {
    const log: string[] = []
    const history = new History({ maxEntries: 2 })
    for (const name of ['a', 'b', 'c']) history.push(command(log, name))
    expect(history.entries().map((c) => c.label)).toEqual(['b', 'c'])
    history.clear()
    expect(log.filter((line) => line.startsWith('dispose'))).toEqual(['dispose a', 'dispose b', 'dispose c'])
    expect(history.store.getState()).toMatchObject({ canUndo: false, canRedo: false })
  })
})
