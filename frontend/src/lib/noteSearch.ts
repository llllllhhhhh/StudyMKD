import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface NoteSearchRange {
  from: number
  to: number
}

interface NoteSearchState {
  query: string
  activeIndex: number
  ranges: NoteSearchRange[]
}

interface NoteSearchMeta {
  query: string
  activeIndex: number
}

export const noteSearchPluginKey = new PluginKey<NoteSearchState>('noteSearch')

export function findNoteSearchMatches(doc: ProseMirrorNode, query: string) {
  const needle = query.trim().toLocaleLowerCase('zh-CN')
  const ranges: NoteSearchRange[] = []
  if (!needle) return ranges

  doc.descendants((node, position) => {
    if (!node.isText || !node.text) return
    const text = node.text.toLocaleLowerCase('zh-CN')
    let cursor = 0
    while (cursor < text.length) {
      const index = text.indexOf(needle, cursor)
      if (index < 0) break
      ranges.push({ from: position + index, to: position + index + needle.length })
      cursor = index + Math.max(1, needle.length)
    }
  })
  return ranges
}

function createSearchState(doc: ProseMirrorNode, query: string, requestedIndex: number): NoteSearchState {
  const ranges = findNoteSearchMatches(doc, query)
  const activeIndex = ranges.length
    ? ((requestedIndex % ranges.length) + ranges.length) % ranges.length
    : 0
  return { query, activeIndex, ranges }
}

export const NoteSearchExtension = Extension.create({
  name: 'noteSearch',
  addProseMirrorPlugins() {
    return [new Plugin<NoteSearchState>({
      key: noteSearchPluginKey,
      state: {
        init: (_, state) => createSearchState(state.doc, '', 0),
        apply: (transaction, previous) => {
          const meta = transaction.getMeta(noteSearchPluginKey) as NoteSearchMeta | undefined
          if (!meta && !transaction.docChanged) return previous
          return createSearchState(
            transaction.doc,
            meta?.query ?? previous.query,
            meta?.activeIndex ?? previous.activeIndex,
          )
        },
      },
      props: {
        decorations(state) {
          const search = noteSearchPluginKey.getState(state)
          if (!search?.ranges.length) return null
          return DecorationSet.create(state.doc, search.ranges.map((range, index) => Decoration.inline(
            range.from,
            range.to,
            { class: index === search.activeIndex ? 'note-search-match note-search-current' : 'note-search-match' },
          )))
        },
      },
    })]
  },
})
