const { ipcRenderer, shell } = require('electron');

// DOM elements
const selectFileButton = document.getElementById('select-file-button');
const selectedFileElement = document.getElementById('selected-file');
const videoDurationElement = document.getElementById('video-duration');
const selectOutputButton = document.getElementById('select-output-button');
const selectedOutputElement = document.getElementById('selected-output');
const segmentsContainer = document.getElementById('segments');
const addSegmentButton = document.getElementById('add-segment-button');
const processButton = document.getElementById('process-button');
const resultsContainer = document.getElementById('results-container');
const inputVideo = document.getElementById('input-video');
const currentTimeElement = document.getElementById('current-time');
const addFromPreviewButton = document.getElementById('add-from-preview-button');

// Application state
let selectedFile = null;
let outputDirectory = null;
let videoDuration = 0;
let segments = [];

// Initialize the first segment
addSegment();

// Event listeners
selectFileButton.addEventListener('click', async () => {
  const filePath = await ipcRenderer.invoke('select-file');
  if (filePath) {
    selectedFile = filePath;
    selectedFileElement.textContent = `Selected: ${filePath}`;
    
    try {
      videoDuration = await ipcRenderer.invoke('get-video-duration', filePath);
      videoDurationElement.textContent = `Duration: ${formatTime(videoDuration)}`;
      
      // Update max values for all segments
      updateSegmentMaxValues();
      
      // Set the video source for preview
      inputVideo.src = `file://${filePath}`;
      inputVideo.load();
      
      // Enable the add from preview button
      addFromPreviewButton.disabled = false;
    } catch (err) {
      console.error('Failed to get video duration:', err);
      videoDurationElement.textContent = 'Error: Could not determine video duration';
    }
    
    updateProcessButtonState();
  }
});

selectOutputButton.addEventListener('click', async () => {
  const dirPath = await ipcRenderer.invoke('select-output-dir');
  if (dirPath) {
    outputDirectory = dirPath;
    selectedOutputElement.textContent = `Selected: ${dirPath}`;
    updateProcessButtonState();
  }
});

addSegmentButton.addEventListener('click', () => {
  addSegment();
});

// Add segment at current preview time
addFromPreviewButton.addEventListener('click', () => {
  if (inputVideo.paused) {
    const currentTime = inputVideo.currentTime;
    addSegmentAt(currentTime);
  } else {
    // If video is playing, pause it and then add segment
    inputVideo.pause();
    const currentTime = inputVideo.currentTime;
    addSegmentAt(currentTime);
  }
});

// Update current time display when video time updates
inputVideo.addEventListener('timeupdate', () => {
  currentTimeElement.textContent = formatTimeWithMilliseconds(inputVideo.currentTime);
});

processButton.addEventListener('click', async () => {
  if (!selectedFile || !outputDirectory || segments.length === 0) {
    return;
  }
  
  // Disable UI during processing
  processButton.disabled = true;
  processButton.textContent = 'Processing...';
  
  // Clear previous results
  resultsContainer.innerHTML = '';
  
  try {
    // Collect segment data
    const segmentData = segments.map(segment => ({
      startTime: parseFloat(segment.startTimeInput.value),
      duration: parseFloat(segment.durationInput.value)
    }));
    
    // Process video
    const results = await ipcRenderer.invoke('process-video', {
      inputFile: selectedFile,
      outputDir: outputDirectory,
      segments: segmentData
    });
    
    // Display results with previews
    results.forEach(result => {
      const resultElement = document.createElement('div');
      resultElement.className = `result-item ${result.status}`;
      
      if (result.status === 'success') {
        // Create header with segment info and show in folder button
        const headerDiv = document.createElement('div');
        headerDiv.className = 'result-header';
        
        const headerText = document.createElement('h3');
        headerText.textContent = `Segment ${result.segment}`;
        headerDiv.appendChild(headerText);
        
        const showInFolderButton = document.createElement('button');
        showInFolderButton.className = 'secondary-button';
        showInFolderButton.textContent = 'Show in Folder';
        showInFolderButton.addEventListener('click', () => {
          shell.showItemInFolder(result.file);
        });
        headerDiv.appendChild(showInFolderButton);
        
        resultElement.appendChild(headerDiv);
        
        // Add file path
        const pathElement = document.createElement('div');
        pathElement.className = 'result-path';
        pathElement.textContent = result.file;
        resultElement.appendChild(pathElement);
        
        // Add video preview
        const previewContainer = document.createElement('div');
        previewContainer.className = 'preview-container';
        
        const videoElement = document.createElement('video');
        videoElement.className = 'video-preview';
        videoElement.src = `file://${result.file}`;
        videoElement.controls = true;
        
        previewContainer.appendChild(videoElement);
        resultElement.appendChild(previewContainer);
      } else {
        resultElement.textContent = `Segment ${result.segment}: Error - ${result.error}`;
      }
      
      resultsContainer.appendChild(resultElement);
    });
  } catch (err) {
    console.error('Error processing video:', err);
    const errorElement = document.createElement('div');
    errorElement.className = 'result-item error';
    errorElement.textContent = `Error: ${err.message}`;
    resultsContainer.appendChild(errorElement);
  } finally {
    // Re-enable UI
    processButton.disabled = false;
    processButton.textContent = 'Process Video';
  }
});

// Helper functions
function addSegment() {
  const segmentId = segments.length;
  const segmentElement = document.createElement('div');
  segmentElement.className = 'segment';
  
  // Create segment inputs
  const startTimeLabel = document.createElement('label');
  startTimeLabel.textContent = 'Start Time (s):';
  
  const startTimeInput = document.createElement('input');
  startTimeInput.type = 'number';
  startTimeInput.min = '0';
  startTimeInput.max = videoDuration > 0 ? videoDuration.toString() : '0';
  startTimeInput.step = '0.1';
  startTimeInput.value = '0';
  
  const durationLabel = document.createElement('label');
  durationLabel.textContent = 'Duration (s):';
  
  const durationInput = document.createElement('input');
  durationInput.type = 'number';
  durationInput.min = '0.1';
  durationInput.max = videoDuration > 0 ? videoDuration.toString() : '60';
  durationInput.step = '0.1';
  durationInput.value = '60';
  
  // Create remove button
  const removeButton = document.createElement('button');
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => {
    removeSegment(segmentId);
  });
  
  // Append elements to segment
  segmentElement.appendChild(startTimeLabel);
  segmentElement.appendChild(startTimeInput);
  segmentElement.appendChild(durationLabel);
  segmentElement.appendChild(durationInput);
  segmentElement.appendChild(removeButton);
  
  // Add to DOM
  segmentsContainer.appendChild(segmentElement);
  
  // Add to segments array
  segments.push({
    id: segmentId,
    element: segmentElement,
    startTimeInput,
    durationInput
  });
}

// Add segment at specific time
function addSegmentAt(startTime) {
  const segmentId = segments.length;
  const segmentElement = document.createElement('div');
  segmentElement.className = 'segment';
  
  // Create segment inputs
  const startTimeLabel = document.createElement('label');
  startTimeLabel.textContent = 'Start Time (s):';
  
  const startTimeInput = document.createElement('input');
  startTimeInput.type = 'number';
  startTimeInput.min = '0';
  startTimeInput.max = videoDuration > 0 ? videoDuration.toString() : '0';
  startTimeInput.step = '0.001';
  startTimeInput.value = startTime.toFixed(3);
  
  const durationLabel = document.createElement('label');
  durationLabel.textContent = 'Duration (s):';
  
  const durationInput = document.createElement('input');
  durationInput.type = 'number';
  durationInput.min = '0.1';
  durationInput.max = videoDuration > 0 ? (videoDuration - startTime).toString() : '60';
  durationInput.step = '0.1';
  durationInput.value = '60';
  
  // Create remove button
  const removeButton = document.createElement('button');
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => {
    removeSegment(segmentId);
  });
  
  // Append elements to segment
  segmentElement.appendChild(startTimeLabel);
  segmentElement.appendChild(startTimeInput);
  segmentElement.appendChild(durationLabel);
  segmentElement.appendChild(durationInput);
  segmentElement.appendChild(removeButton);
  
  // Add to DOM
  segmentsContainer.appendChild(segmentElement);
  
  // Add to segments array
  segments.push({
    id: segmentId,
    element: segmentElement,
    startTimeInput,
    durationInput
  });

  // Update process button state
  updateProcessButtonState();
}

function removeSegment(id) {
  const segmentIndex = segments.findIndex(s => s.id === id);
  
  if (segmentIndex !== -1) {
    // Remove from DOM
    segmentsContainer.removeChild(segments[segmentIndex].element);
    
    // Remove from array
    segments.splice(segmentIndex, 1);
    
    // Update process button state
    updateProcessButtonState();
  }
}

function updateSegmentMaxValues() {
  if (videoDuration > 0) {
    segments.forEach(segment => {
      segment.startTimeInput.max = videoDuration.toString();
      
      // Also update the duration max based on the start time
      const startTime = parseFloat(segment.startTimeInput.value);
      segment.durationInput.max = (videoDuration - startTime).toString();
      
      // Add event listener to update duration max when start time changes
      segment.startTimeInput.addEventListener('change', () => {
        const newStartTime = parseFloat(segment.startTimeInput.value);
        segment.durationInput.max = (videoDuration - newStartTime).toString();
        
        // If current duration exceeds new max, adjust it
        if (parseFloat(segment.durationInput.value) > parseFloat(segment.durationInput.max)) {
          segment.durationInput.value = segment.durationInput.max;
        }
      });
    });
  }
}

function updateProcessButtonState() {
  processButton.disabled = !(selectedFile && outputDirectory && segments.length > 0);
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatTimeWithMilliseconds(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}