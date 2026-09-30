import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'
import { SectionFilterList } from '../../../src/ui/lib/section-filter-list'

const item = { id: '1', text: ['project'] }
const props = {
  groups: [{ identifier: 'folder', items: [item] }],
  rowHeight: 29,
  selectedItem: item,
  renderItem: () => <div />,
  renderGroupHeader: () => <div />,
  isGroupCollapsed: () => true,
  invalidationProps: {},
}

describe('collapsible filter list groups', () => {
  it('retains a collapsed header and removes hidden items from keyboard selection', () => {
    const list = new SectionFilterList(props)
    assert.deepEqual(
      list.state.rows[0].map(row => row.kind),
      ['group']
    )
    assert.equal(list.state.selectedRow.row, -1)
  })

  it('reveals search matches even when the group is collapsed', () => {
    const list = new SectionFilterList({ ...props, filterText: 'project' })
    assert.deepEqual(
      list.state.rows[0].map(row => row.kind),
      ['group', 'item']
    )
    assert.equal(list.state.selectedRow.row, 1)
    const noMatches = new SectionFilterList({ ...props, filterText: 'missing' })
    assert.equal(noMatches.state.rows.length, 0)
  })

  it('keeps other groups expanded and preserves their selection', () => {
    const other = { id: '2', text: ['other project'] }
    const list = new SectionFilterList({
      ...props,
      selectedItem: other,
      groups: [...props.groups, { identifier: 'account', items: [other] }],
      isGroupCollapsed: group => group === 'folder',
    })
    assert.deepEqual(
      list.state.rows.map(rows => rows.length),
      [1, 2]
    )
    assert.deepEqual(list.state.selectedRow, { section: 1, row: 1 })
  })

  it('restores items when expanded and never hides items without a header', () => {
    const expanded = new SectionFilterList({
      ...props,
      isGroupCollapsed: () => false,
    })
    assert.equal(expanded.state.rows[0].length, 2)
    const noHeader = new SectionFilterList({
      ...props,
      renderGroupHeader: undefined,
    })
    assert.deepEqual(
      noHeader.state.rows[0].map(row => row.kind),
      ['item']
    )
  })
})
