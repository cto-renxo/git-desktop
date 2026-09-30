import { IMenuItem } from '../../lib/menu-item'
import { Shell } from '../../lib/shells'
import { Shell as WindowsShell } from '../../lib/shells/win32'
import { DefaultEditorLabel, RevealInFileManagerLabel } from './context-menu'

export interface IFolderActions {
  readonly path: string
  readonly missing: boolean
  readonly availableEditors: ReadonlyArray<string>
  readonly editorLabel: string | undefined
  readonly shellLabel: string
  readonly openShell: (path: string, shell?: Shell) => void
  readonly openEditor: (path: string, editor?: string) => void
  readonly reveal: (path: string) => void
  readonly copy: (path: string) => void
}

/** Shared by the current checkout and repository/worktree context menus. */
export function getFolderActions(
  config: IFolderActions
): ReadonlyArray<IMenuItem> {
  const { path, missing } = config
  const shells: ReadonlyArray<Shell | undefined> = __WIN32__
    ? [WindowsShell.Cmd, WindowsShell.WSL, WindowsShell.PowerShell]
    : []
  const items: IMenuItem[] = shells.map(shell => ({
    label: `Open in ${shell}`,
    action: () => config.openShell(path, shell),
    enabled: !missing,
  }))
  if (!shells.includes(config.shellLabel as Shell)) {
    items.push({
      label: `Open in ${config.shellLabel}`,
      action: () => config.openShell(path),
      enabled: !missing,
    })
  }
  return [
    ...items,
    ...(config.availableEditors.includes('Visual Studio Code')
      ? [
          {
            label: 'Open in Visual Studio Code',
            action: () => config.openEditor(path, 'Visual Studio Code'),
            enabled: !missing,
          },
        ]
      : []),
    ...(config.editorLabel === 'Visual Studio Code' ||
    (config.editorLabel !== undefined &&
      !config.availableEditors.includes(config.editorLabel))
      ? []
      : [
          {
            label: config.editorLabel
              ? `Open in ${config.editorLabel}`
              : DefaultEditorLabel,
            action: () => config.openEditor(path),
            enabled: !missing,
          },
        ]),
    {
      label: __WIN32__ ? 'Open in Explorer' : RevealInFileManagerLabel,
      action: () => config.reveal(path),
      enabled: !missing,
    },
    { type: 'separator' },
    { label: 'Copy path', action: () => config.copy(path) },
  ]
}
