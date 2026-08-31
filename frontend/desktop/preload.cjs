const { contextBridge, ipcRenderer } = require('electron')

const syncListeners = new Set()

ipcRenderer.on('studymkd:data-sync', (_event, message) => {
  syncListeners.forEach((listener) => listener(message))
})

contextBridge.exposeInMainWorld('studyMKDDesktop', {
  isDesktop: true,
  platform: process.platform,
  nativeRequest: (path, body) => ipcRenderer.invoke('studymkd:native-request', path, body),
  openFocusWindow: (context) => ipcRenderer.invoke('studymkd:open-focus-window', context),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('studymkd:set-always-on-top', value),
  collapseFocusWindow: () => ipcRenderer.invoke('studymkd:collapse-focus-window'),
  expandFocusWindow: () => ipcRenderer.invoke('studymkd:expand-focus-window'),
  getWindowState: () => ipcRenderer.invoke('studymkd:get-window-state'),
  closeCurrentWindow: () => ipcRenderer.invoke('studymkd:close-current-window'),
  showMainWindow: () => ipcRenderer.invoke('studymkd:show-main-window'),
  broadcastDataChanged: (message) => ipcRenderer.send('studymkd:broadcast-data-changed', message),
  onDataChanged: (listener) => {
    syncListeners.add(listener)
    return () => syncListeners.delete(listener)
  },
})
