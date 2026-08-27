interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
}

interface Window {
  showOpenFilePicker?: (options?: { multiple?: boolean }) => Promise<FileSystemFileHandle[]>
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
}
