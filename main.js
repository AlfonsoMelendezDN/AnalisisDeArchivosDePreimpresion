const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// File analyzers
const analyzers = require('./src/analyzers.js');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 800,
    minWidth: 700,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    show: false
  });

  mainWindow.loadFile('src/index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('analyze-file', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const extension = path.extname(filePath).toLowerCase().slice(1);

    let result;
    switch (extension) {
      case 'pdf':
        result = analyzers.analyzePDF(buffer, fileName);
        break;
      case 'jpg':
      case 'jpeg':
        result = analyzers.analyzeJPG(buffer, fileName);
        break;
      case 'tif':
      case 'tiff':
        result = analyzers.analyzeTIFF(buffer, fileName);
        break;
      case 'eps':
        result = analyzers.analyzeEPS(buffer, fileName);
        break;
      default:
        throw new Error(`Formato no soportado: ${extension}`);
    }

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Archivos de imagen', extensions: ['pdf', 'jpg', 'jpeg', 'tif', 'tiff', 'eps'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('read-file-for-preview', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    const extension = path.extname(filePath).toLowerCase().slice(1);

    if (['jpg', 'jpeg'].includes(extension)) {
      return {
        success: true,
        type: 'image',
        data: `data:image/jpeg;base64,${buffer.toString('base64')}`
      };
    } else if (extension === 'pdf') {
      return {
        success: true,
        type: 'pdf',
        data: buffer.toString('base64')
      };
    }

    return { success: true, type: 'none' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
