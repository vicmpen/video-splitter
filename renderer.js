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
const currentTimeSecondsElement = document.getElementById('current-second');


// Application state
let selectedFile = null;
let outputDirectory = null;
let videoDuration = 0;
let segments = [];

// Timeline related variables
let timeline = null;
let isDragging = false;
let timelineRect = null;
let timelineIndicator = null;
let timelineSegmentMarkers = [];

// Initialize the first segment
addSegment();

// Create timeline elements
function createTimeline() {
  // Create timeline container
  const timelineContainer = document.createElement('div');
  timelineContainer.className = 'timeline-container';
  timelineContainer.style.width = '100%';
  timelineContainer.style.height = '40px';
  timelineContainer.style.backgroundColor = '#f0f0f0';
  timelineContainer.style.position = 'relative';
  timelineContainer.style.marginTop = '10px';
  timelineContainer.style.borderRadius = '4px';
  timelineContainer.style.overflow = 'hidden';
  
  // Create timeline
  timeline = document.createElement('div');
  timeline.className = 'timeline';
  timeline.style.width = '100%';
  timeline.style.height = '100%';
  timeline.style.position = 'relative';
  timeline.style.cursor = 'pointer';
  
  // Create progress indicator
  const timelineProgress = document.createElement('div');
  timelineProgress.className = 'timeline-progress';
  timelineProgress.style.height = '100%';
  timelineProgress.style.width = '0';
  timelineProgress.style.backgroundColor = 'rgba(33, 150, 243, 0.3)';
  timelineProgress.style.position = 'absolute';
  timelineProgress.style.top = '0';
  timelineProgress.style.left = '0';
  
  // Create current position indicator
  timelineIndicator = document.createElement('div');
  timelineIndicator.className = 'timeline-indicator';
  timelineIndicator.style.position = 'absolute';
  timelineIndicator.style.top = '0';
  timelineIndicator.style.height = '100%';
  timelineIndicator.style.width = '2px';
  timelineIndicator.style.backgroundColor = '#ff0000';
  timelineIndicator.style.left = '0';
  
  // Create segments container
  const segmentsLayer = document.createElement('div');
  segmentsLayer.className = 'timeline-segments';
  segmentsLayer.style.position = 'absolute';
  segmentsLayer.style.top = '0';
  segmentsLayer.style.left = '0';
  segmentsLayer.style.width = '100%';
  segmentsLayer.style.height = '100%';
  segmentsLayer.style.pointerEvents = 'none';
  
  // Create timestamps
  const timestampsContainer = document.createElement('div');
  timestampsContainer.className = 'timestamps-container';
  timestampsContainer.style.position = 'absolute';
  timestampsContainer.style.bottom = '0';
  timestampsContainer.style.left = '0';
  timestampsContainer.style.width = '100%';
  timestampsContainer.style.height = '15px';
  timestampsContainer.style.fontSize = '10px';
  timestampsContainer.style.color = '#666';
  
  // Add timestamps - initially empty, will be populated when video loads
  for (let i = 0; i <= 10; i++) {
    const timestamp = document.createElement('div');
    timestamp.style.position = 'absolute';
    timestamp.style.left = `${i * 10}%`;
    timestamp.style.bottom = '2px';
    timestamp.style.transform = 'translateX(-50%)';
    timestamp.textContent = '00:00';
    timestampsContainer.appendChild(timestamp);
    
    // Add tick marks
    const tick = document.createElement('div');
    tick.style.position = 'absolute';
    tick.style.left = `${i * 10}%`;
    tick.style.bottom = '15px';
    tick.style.height = '4px';
    tick.style.width = '1px';
    tick.style.backgroundColor = '#666';
    timestampsContainer.appendChild(tick);
  }
  
  // Assemble timeline components
  timeline.appendChild(timelineProgress);
  timeline.appendChild(segmentsLayer);
  timeline.appendChild(timelineIndicator);
  timelineContainer.appendChild(timeline);
  timelineContainer.appendChild(timestampsContainer);
  
  // Add timeline interactions
  timeline.addEventListener('mousedown', (e) => {
    if (!videoDuration) return;
    
    timelineRect = timeline.getBoundingClientRect();
    const clickX = e.clientX - timelineRect.left;
    const percentX = clickX / timelineRect.width;
    const seekTime = percentX * videoDuration;
    
    // Seek video to this position
    inputVideo.currentTime = seekTime;
    
    isDragging = true;
  });

  document.addEventListener('keydown', (e) => {
    // Only process if we have a video loaded
    if (!inputVideo.src || !videoDuration) return;
    
    // Left arrow: move back 0.1 seconds
    if (e.key === 'ArrowLeft') {
      e.preventDefault(); // Prevent scrolling
      const newTime = Math.max(0, inputVideo.currentTime - 0.1);
      inputVideo.currentTime = newTime;
    }
    
    // Right arrow: move forward 0.1 seconds
    if (e.key === 'ArrowRight') {
      e.preventDefault(); // Prevent scrolling
      const newTime = Math.min(videoDuration, inputVideo.currentTime + 0.1);
      inputVideo.currentTime = newTime;
    }
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging || !timelineRect) return;
    
    let moveX = e.clientX - timelineRect.left;
    // Clamp to timeline bounds
    moveX = Math.max(0, Math.min(moveX, timelineRect.width));
    
    const percentX = moveX / timelineRect.width;
    const seekTime = percentX * videoDuration;
    
    // Update video position
    inputVideo.currentTime = seekTime;
  });
  
  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
  
  // Find where to insert the timeline - right after the video
  const videoParent = inputVideo.parentElement;
  videoParent.insertBefore(timelineContainer, inputVideo.nextSibling);
    
    // Return segments layer for later updates
    return segmentsLayer;
    }

// Update timeline
function updateTimeline() {
  if (!timeline) return;
  
  // Update timestamps
  const timestampsContainer = document.querySelector('.timestamps-container');
  const timestamps = timestampsContainer.querySelectorAll('div');
  
  // Update only text nodes (not tick marks)
  let timestampIndex = 0;
  for (let i = 0; i <= 10; i++) {
    const timeValue = (i / 10) * videoDuration;
    timestamps[timestampIndex].textContent = formatTimeShort(timeValue);
    timestampIndex += 2; // Skip tick marks
  }
}

// Update timeline progress and indicator
function updateTimelineProgress(currentTime) {
  if (!timeline) return;
  
  const progressPercent = (currentTime / videoDuration) * 100;
  const progressElement = document.querySelector('.timeline-progress');
  progressElement.style.width = `${progressPercent}%`;
  
  timelineIndicator.style.left = `${progressPercent}%`;
}

// Update segment markers on timeline
function updateSegmentMarkers() {
  if (!timeline) return;
  
  // Clear existing markers
  const segmentsLayer = document.querySelector('.timeline-segments');
  segmentsLayer.innerHTML = '';
  
  // Add marker for each segment
  segments.forEach((segment, index) => {
    const startTime = parseFloat(segment.startTimeInput.value);
    const duration = parseFloat(segment.durationInput.value);
    const endTime = startTime + duration;
    
    const startPercent = (startTime / videoDuration) * 100;
    const widthPercent = ((endTime - startTime) / videoDuration) * 100;
    
    const segmentMarker = document.createElement('div');
    segmentMarker.className = 'segment-marker';
    segmentMarker.style.position = 'absolute';
    segmentMarker.style.top = '-10';
    segmentMarker.style.left = `${startPercent}%`;
    segmentMarker.style.width = `${widthPercent}%`;
    segmentMarker.style.height = '100%';
    segmentMarker.style.backgroundColor = 'rgba(76, 175, 80, 0.5)';
    segmentMarker.style.border = '1px solid rgba(76, 175, 80, 0.8)';
    segmentMarker.style.boxSizing = 'border-box';
    
    // Add segment number
    const segmentLabel = document.createElement('div');
    segmentLabel.style.position = 'absolute';
    segmentLabel.style.top = '2px';
    segmentLabel.style.left = '2px';
    segmentLabel.style.fontSize = '10px';
    segmentLabel.style.fontWeight = 'bold';
    segmentLabel.style.color = '#000';
    segmentLabel.textContent = (index + 1).toString();
    segmentMarker.appendChild(segmentLabel);
    
    segmentsLayer.appendChild(segmentMarker);
  });
}

// Format time without milliseconds
function formatTimeShort(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

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
      inputVideo.src = process.platform === 'darwin' 
        ? `file://${filePath.replace(/\s/g, '%20')}` 
        : `file://${filePath}`;
      inputVideo.load();
      
      // Create timeline if it doesn't exist yet
      if (!timeline) {
        createTimeline();
      }
      
      // Update timeline with new video duration
      updateTimeline();
      updateSegmentMarkers();
      
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
  updateSegmentMarkers();
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
  updateSegmentMarkers();
});

// Update current time display when video time updates
inputVideo.addEventListener('timeupdate', () => {
  const currentTime = inputVideo.currentTime;
  currentTimeElement.textContent = formatTimeWithMilliseconds(currentTime);
  currentTimeSecondsElement.textContent = `${currentTime.toFixed(3)} sec`;
  updateTimelineProgress(currentTime);
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
          if (process.platform === 'darwin') {
            // On macOS, we need to open the folder instead of selecting the file
            // as showItemInFolder behaves differently on macOS
            shell.openPath(path.dirname(result.file));
          } else {
            shell.showItemInFolder(result.file);
          }
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
        videoElement.src = process.platform === 'darwin' 
          ? `file://${result.file.replace(/\s/g, '%20')}` 
          : `file://${result.file}`;
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

addResetButton();


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
  
  // Add event listeners to update timeline when values change
  startTimeInput.addEventListener('change', updateSegmentMarkers);
  durationInput.addEventListener('change', updateSegmentMarkers);
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
  durationInput.value = Math.min(60, videoDuration - startTime).toFixed(1);
  
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
  
  // Add event listeners to update timeline when values change
  startTimeInput.addEventListener('change', updateSegmentMarkers);
  durationInput.addEventListener('change', updateSegmentMarkers);

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
    
    // Update timeline
    updateSegmentMarkers();
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
        
        // Update timeline
        updateSegmentMarkers();
      });
      
      // Update timeline when duration changes
      segment.durationInput.addEventListener('change', updateSegmentMarkers);
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

// Listen for segment progress updates
ipcRenderer.on('segment-progress', (event, progress) => {
  // Find or create progress element for this segment
  let progressElement = document.getElementById(`progress-segment-${progress.segment}`);
  
  if (!progressElement) {
    // Create progress display if it doesn't exist
    progressElement = document.createElement('div');
    progressElement.id = `progress-segment-${progress.segment}`;
    progressElement.className = 'segment-progress';
    progressElement.style.margin = '5px 0';
    progressElement.style.padding = '8px';
    progressElement.style.backgroundColor = '#f0f0f0';
    progressElement.style.borderRadius = '4px';
    
    // Add it to the results container
    resultsContainer.appendChild(progressElement);
  }
  
  // Update progress information
  if (progress.status === 'error') {
    progressElement.style.backgroundColor = '#ffebee';
    progressElement.innerHTML = `Segment ${progress.segment}: Error - ${progress.error}`;
  } else if (progress.status === 'complete') {
    progressElement.style.backgroundColor = '#e8f5e9';
    progressElement.innerHTML = `Segment ${progress.segment}: Processing complete (100%)`;
  } else {
    // Update progress information
    progressElement.innerHTML = `
      Segment ${progress.segment}: ${progress.percent}% complete<br>
      Speed: ${progress.currentFps} fps / ${progress.currentKbps} kbps<br>
      Time: ${progress.timemark}
    `;
    
    // Optional: Add a progress bar
    if (!progressElement.querySelector('.progress-bar')) {
      const progressBar = document.createElement('div');
      progressBar.className = 'progress-bar';
      progressBar.style.height = '10px';
      progressBar.style.backgroundColor = '#ddd';
      progressBar.style.borderRadius = '5px';
      progressBar.style.marginTop = '5px';
      progressBar.style.position = 'relative';
      
      const progressFill = document.createElement('div');
      progressFill.className = 'progress-fill';
      progressFill.style.height = '100%';
      progressFill.style.backgroundColor = '#4CAF50';
      progressFill.style.borderRadius = '5px';
      progressFill.style.width = '0%';
      progressFill.style.transition = 'width 0.3s';
      
      progressBar.appendChild(progressFill);
      progressElement.appendChild(progressBar);
    }
    
    // Update progress bar
    const progressFill = progressElement.querySelector('.progress-fill');
    if (progressFill) {
      progressFill.style.width = `${progress.percent}%`;
    }
  }
});

function addResetButton() {
  // Create the button if it doesn't exist
  if (!document.getElementById('reset-button')) {
    const resetButton = document.createElement('button');
    resetButton.id = 'reset-button';
    resetButton.textContent = 'Reset';
    resetButton.style.marginTop = '20px';
    resetButton.style.backgroundColor = '#f44336';
    resetButton.style.padding = '10px 20px';
    resetButton.style.fontSize = '16px';
    
    // Add event listener
    resetButton.addEventListener('click', () => {
      // Reset the application state
      resetApplication();
    });
    
    // Add to DOM at the end of the container
    document.querySelector('.container').appendChild(resetButton);
  }
}

function resetApplication() {
  // Reset file selection
  selectedFile = null;
  selectedFileElement.textContent = 'No file selected';
  videoDurationElement.textContent = '';
  
  // Reset output directory
  outputDirectory = null;
  selectedOutputElement.textContent = 'No folder selected';
  
  // Reset video
  inputVideo.src = '';
  inputVideo.load();
  
  // Reset timeline if it exists
  if (timeline) {
    const progressElement = document.querySelector('.timeline-progress');
    if (progressElement) progressElement.style.width = '0';
    
    const segmentsLayer = document.querySelector('.timeline-segments');
    if (segmentsLayer) segmentsLayer.innerHTML = '';
    
    timelineIndicator.style.left = '0';
  }
  
  // Reset current time display
  currentTimeElement.textContent = '00:00:00.000';
  if (currentTimeSecondsElement) {
    currentTimeSecondsElement.textContent = '0.000 sec';
  }
  
  // Remove all segments except the first one
  while (segments.length > 0) {
    removeSegment(segments[0].id);
  }
  
  // Add one empty segment
  // addSegment();
  
  // Reset results
  resultsContainer.innerHTML = '';
  
  // Disable buttons
  processButton.disabled = true;
  addFromPreviewButton.disabled = true;
  if (document.getElementById('add-from-selection-button')) {
    document.getElementById('add-from-selection-button').disabled = true;
  }
  
  // Reset video duration
  videoDuration = 0;
}