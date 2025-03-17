const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');

let ffmpegPath;
let ffprobePath;
if (app.isPackaged) {
    ffmpegPath = path.join(process.resourcesPath, 'ffmpeg-bin', 'ffmpeg.exe');
    ffprobePath = path.join(process.resourcesPath, 'ffmpeg-bin', 'ffprobe.exe');
  } else {
    ffmpegPath = require('ffmpeg-static');
    ffprobePath = require('ffprobe-static').path;
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
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false // Allow loading local video files
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Rest of your main.js code remains the same
// ...

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
        ffmpeg(inputFile)
          .setStartTime(segment.startTime)
          .setDuration(segment.duration)
          .output(outputFile)
          .on('end', () => {
            results.push({
              segment: i + 1,
              status: 'success',
              file: outputFile
            });
            resolve();
          })
          .on('error', (err) => {
            results.push({
              segment: i + 1,
              status: 'error',
              error: err.message
            });
            reject(err);
          })
          .run();
      });
    } catch (err) {
      console.error(`Error processing segment ${i+1}:`, err);
    }
  }
  
  return results;
});