const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  analyzeFile: (filePath) => ipcRenderer.invoke('analyze-file', filePath),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  readFileForPreview: (filePath) => ipcRenderer.invoke('read-file-for-preview', filePath)
});
