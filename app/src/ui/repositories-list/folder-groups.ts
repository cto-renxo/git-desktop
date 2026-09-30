import * as Path from 'path'

/** Canonical keys respect the host platform's path separators and case rules. */
export function folderGroupKey(folder: string): string {
  const normalized = Path.normalize(folder)
  const root = Path.parse(normalized).root
  const withoutTrailingSeparator =
    normalized.length > root.length
      ? normalized.replace(/[\\/]+$/, '')
      : normalized
  return process.platform === 'win32'
    ? withoutTrailingSeparator.toLowerCase()
    : withoutTrailingSeparator
}

export function normalizeFolderGroups(folders: ReadonlyArray<string>) {
  const unique = new Map<string, string>()
  for (const folder of folders) {
    if (Path.isAbsolute(folder)) {
      const key = folderGroupKey(folder)
      if (!unique.has(key)) {
        unique.set(key, Path.normalize(folder))
      }
    }
  }
  return Array.from(unique.values())
}

/** Use the deepest configured ancestor, with directory boundaries respected. */
export function findFolderGroup(
  repositoryPath: string,
  folders: ReadonlyArray<string>
): string | undefined {
  const repositoryKey = folderGroupKey(repositoryPath)
  return folders
    .filter(folder => {
      const relative = Path.relative(folderGroupKey(folder), repositoryKey)
      return (
        relative === '' ||
        (relative !== '..' &&
          !relative.startsWith(`..${Path.sep}`) &&
          !Path.isAbsolute(relative))
      )
    })
    .sort((a, b) => folderGroupKey(b).length - folderGroupKey(a).length)[0]
}
