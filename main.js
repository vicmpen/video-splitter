const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');

let ffmpegPath;
let ffprobePath;

if (app.isPackaged) {
  if (process.platform === 'darwin') {
    ffmpegPath = path.join(process.resourcesPath, 'ffmpeg-bin', 'ffmpeg');
    ffprobePath = path.join(process.resourcesPath, 'ffmpeg-bin', 'ffprobe');
  } else {
    ffmpegPath = path.join(process.resourcesPath, 'ffmpeg-bin', 'ffmpeg.exe');
    ffprobePath = path.join(process.resourcesPath, 'ffmpeg-bin', 'ffprobe.exe');
  }
} else {
  ffmpegPath = require('ffmpeg-static');
  ffprobePath = require('ffprobe-static').path;
}

if (!app.isPackaged) {
  try {
    require('electron-reloader')(module, {
      watchRenderer: true,
      ignore: [
        /node_modules/,
        /[\/\\]\./
      ]
    });
    console.log('Electron reloader initialized');
  } catch (err) {
    console.error('Error setting up electron-reloader:', err);
  }
}

// Check if the paths exist
if (!fs.existsSync(ffmpegPath)) {
  console.error(`FFmpeg not found at: ${ffmpegPath}`);
}
if (!fs.existsSync(ffprobePath)) {
  console.error(`FFprobe not found at: ${ffprobePath}`);
}

// Set the ffmpeg and ffprobe paths
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false // Allow loading local video files
    }
  });

  mainWindow.loadFile('index.html');
  
  // Add macOS-specific menu handling
  if (process.platform === 'darwin') {
    const { Menu } = require('electron');
    const template = [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ]
      }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Handle file selection
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'MP4 Videos', extensions: ['mp4'] }]
  });
  
  if (!result.canceled) {
    return result.filePaths[0];
  }
  return null;
});

// Handle output directory selection
ipcMain.handle('select-output-dir', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  
  if (!result.canceled) {
    return result.filePaths[0];
  }
  return null;
});

// Get video duration
ipcMain.handle('get-video-duration', async (event, filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(metadata.format.duration);
    });
  });
});

// Process video splits
ipcMain.handle('process-video', async (event, { inputFile, outputDir, segments }) => {
  const results = [];
  const fileName = path.basename(inputFile, path.extname(inputFile));
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const outputFile = path.join(outputDir, `${fileName}_segment_${i+1}.mp4`);
    
    try {
      await new Promise((resolve, reject) => {
        const command = ffmpeg(inputFile)
          .setStartTime(segment.startTime)
          .setDuration(segment.duration)
          .output(outputFile);
        
        // Add progress event handler
        command.on('progress', (progress) => {
          // Send progress updates to renderer
          event.sender.send('segment-progress', {
            segment: i + 1,
            percent: Math.round(progress.percent * 100) / 100,
            currentFps: progress.currentFps,
            currentKbps: progress.currentKbps,
            targetSize: progress.targetSize,
            timemark: progress.timemark
          });
        });
        
        command.on('end', () => {
          // Send complete status
          event.sender.send('segment-progress', {
            segment: i + 1,
            percent: 100,
            status: 'complete'
          });
          
          results.push({
            segment: i + 1,
            status: 'success',
            file: outputFile
          });
          resolve();
        });
        
        command.on('error', (err) => {
          event.sender.send('segment-progress', {
            segment: i + 1,
            status: 'error',
            error: err.message
          });
          
          results.push({
            segment: i + 1,
            status: 'error',
            error: err.message
          });
          reject(err);
        });
        
        command.run();
      });
    } catch (err) {
      console.error(`Error processing segment ${i+1}:`, err);
    }
  }
  
  return results;
});