let viewer;
let smoothingEnabled = true;
let menuCollapsed = false;
let filterPanelCollapsed = false;
let logPanelVisible = false; 
let homeRotation = 0;
let labelingMode = false;
let currentLabelColor = '#ff0000';
let currentLabelText = '';
let labels = []; // Store all labels with their data
let labelTypes = {}; // Store label type definitions
let labelIdCounter = 0;
let pendingLabelPosition = null; 

// Global UI State
let uiGloballyVisible = true;
let menuWasCollapsed = false; 
let filterWasCollapsed = false; 

// Function to log messages to both console and UI
function logToConsoleAndUI(message, type = 'info') { 
    // Adjusted logging logic to use string type ('info', 'success', 'error')
    const logWhenHidden = type === 'error' || type === 'success';
    if (!uiGloballyVisible && !logWhenHidden) return; 
    
    const logOutput = document.getElementById('log-output');
    if (!logOutput) {
        if (type === 'error') console.error(`Log UI element not found: ${message}`);
        else console.log(message);
        return;
    }

    const logEntry = document.createElement('div');
    logEntry.innerHTML = `<span style="font-family: monospace;">[${new Date().toLocaleTimeString()}]</span> ${message}`;
    logEntry.style.marginBottom = '2px';

    let color = '#dddddd';
    if (type === 'error') color = '#ff6666';
    else if (type === 'success') color = '#4CAF50'; 
    logEntry.style.color = color;

    logOutput.appendChild(logEntry); 

    while (logOutput.children.length > 20) {
        logOutput.removeChild(logOutput.firstChild); 
    }
    
    if (uiGloballyVisible || type === 'error') {
        logOutput.scrollTop = logOutput.scrollHeight; 
    }

    if (type === 'error') {
        console.error(message);
    } else {
        console.log(message);
    }
}

// Global key handler - this will capture ALL keydown events before OpenSeadragon can process them
function globalKeyHandler(event) {
  const key = event.key;
  const lowerKey = key.toLowerCase();
  const isModalOpen = document.getElementById('label-modal').style.display === 'flex';
  const isInputTarget = event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA';
  
  // 1. Handle Modal shortcuts (Highest priority when modal is open)
  if (isModalOpen) {
    if (key === 'Enter') {
      event.preventDefault(); 
      event.stopPropagation();
      confirmLabelCreation();
      return false;
    }
    if (key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelLabelCreation();
      return false;
    }
  }

  // 2. Allow normal typing in input fields for all other keys
  if (isInputTarget) {
      return true;
  }
  
  // 3. Block OSD keys (W, A, D) when not typing
  const blockedKeys = ['w', 'a', 'd'];
  if (blockedKeys.includes(lowerKey)) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return false;
  }
  
  // 4. Handle other custom shortcuts
  switch(lowerKey) { 
    case '\\': // Handle backslash key - only toggle log if UI is visible
      event.preventDefault();
      event.stopPropagation();
      if (uiGloballyVisible) {
          toggleLogPanel();
      }
      return false;
    case 'u': // Toggle All UI
      event.preventDefault();
      event.stopPropagation();
      toggleAllUI();
      return false;
    case 'r':
      event.preventDefault();
      event.stopPropagation();
      resetView();
      return false;
    case 'f':
      event.preventDefault();
      event.stopPropagation();
      toggleFullscreen();
      return false;
    case 's':
      event.preventDefault();
      event.stopPropagation();
      toggleSmoothing();
      return false;
    case 'm':
      event.preventDefault();
      event.stopPropagation();
      if (uiGloballyVisible) toggleMenu();
      return false;
    case 'l':
      event.preventDefault();
      event.stopPropagation();
      if (uiGloballyVisible) startLabelingMode(); 
      return false;
    case 'n':
      event.preventDefault();
      event.stopPropagation();
      if (uiGloballyVisible) toggleFilterPanel();
      return false;
    case 'x':
      event.preventDefault();
      event.stopPropagation();
      const currentRotation = viewer.viewport.getRotation();
      viewer.viewport.setRotation(currentRotation + 1);
      return false;
    case 'z':
      event.preventDefault();
      event.stopPropagation();
      const currentRotationCCW = viewer.viewport.getRotation();
      viewer.viewport.setRotation(currentRotationCCW - 1);
      return false;
    case 'escape': 
      // Handle ESC to cancel labeling mode (if modal is not open)
      if (labelingMode) {
        event.preventDefault();
        event.stopPropagation();
        cancelLabelCreation(); 
        return false;
      }
      break;
  }
  return true; 
}

// Add the global key handler with highest priority (capture phase)
document.addEventListener('keydown', globalKeyHandler, true);

// Initialize viewer with enhanced quality settings
viewer = OpenSeadragon({
  id: "viewer",
  prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.0.0/images/",
  // Set default tile source to the image processed on server startup
  tileSources: "http://127.0.0.1:8000/nasa_zoom.dzi", 
  
  // 🔥 CRITICAL FIX: Ensures cross-origin images are loaded with CORS headers.
  // This is required for html2canvas to save the image without "tainting" the canvas.
  crossOrigin: "anonymous", 

  // Disable ALL default UI elements
  showNavigator: false,
  showRotationControl: false,
  showHomeControl: false,
  showZoomControl: false,
  showFullPageControl: false,
  showSequenceControl: false,

  // Prevent WASD/arrow keys from moving the image (but allow labeling clicks)
  gestureSettingsMouse: {
    clickToZoom: false,
    dblClickToZoom: true, 
    flickEnabled: true,
    dragToPan: true, 
    scrollToZoom: true,
    pinchToZoom: true
  },
  
  // Image quality improvements
  imageLoaderLimit: 4,
  timeout: 120000,
  useCanvas: true,
  
  // Performance and quality balance
  springStiffness: 8.0,
  animationTime: 1.2,
  blendTime: 0.3,
  alwaysBlend: false,
  
  // Tile loading optimization
  maxImageCacheCount: 200,
  pixelsPerWheelLine: 40,
  visibilityRatio: 1.0,
  minPixelRatio: 0.5,
  
  // Touch and mouse settings
  panHorizontal: true,
  panVertical: true,
  constrainDuringPan: false,
  wrapHorizontal: false,
  wrapVertical: false,
  
  // Zoom constraints
  minZoomLevel: 0.1,
  maxZoomLevel: 20,
  zoomPerClick: 2.0,
  zoomPerScroll: 1.2,
  
  // Rotation
  degrees: 0,
  flipped: false,

  // Disable OpenSeadragon's built-in key handling completely
  keyDownHandler: function(event) { return false; },
  keyUpHandler: function(event) { return false; },
  keyHandler: function(event) { return false; }
});

// Event handlers
viewer.addHandler('open', function(event) {
  logToConsoleAndUI('Image opened successfully', 'info');
  
  // Capture the natural home rotation when image first loads
  homeRotation = viewer.viewport.getRotation();
  
  // Apply high-quality image smoothing
  if (viewer.drawer && viewer.drawer.context) {
    viewer.drawer.context.imageSmoothingEnabled = smoothingEnabled;
    viewer.drawer.context.imageSmoothingQuality = 'high';
    logToConsoleAndUI('Image smoothing: ' + (smoothingEnabled ? 'enabled' : 'disabled'), 'info');
  }
});

// Handle clicks for labeling
viewer.addHandler('canvas-click', function(event) {
  if (labelingMode) {
    // Prevent OSD from doing its default click action 
    event.preventDefaultAction = true;

    // Convert screen coordinates to viewport coordinates
    const viewportPoint = viewer.viewport.pointFromPixel(event.position);
    
    // Store position and show modal for color/text selection
    pendingLabelPosition = {
      viewportPoint: viewportPoint,
      rotation: viewer.viewport.getRotation()
    };
    
    showLabelModal();
  }
});

// Update label positions and rotations on viewport change
viewer.addHandler('viewport-change', function() {
  updateAllLabels();
});

// Continuously ensure our key blocking remains active (but allow input field typing)
viewer.addHandler('canvas-key-down', function(event) {
  const key = event.originalEvent.key.toLowerCase();
  
  // Don't block if typing in input fields
  if (event.originalEvent.target.tagName === 'INPUT' || event.originalEvent.target.tagName === 'TEXTAREA') {
    return true;
  }
  
  const blockedKeys = ['w', 'a', 'd'];
  if (blockedKeys.includes(key)) {
    event.preventDefaultAction = true;
    event.stopPropagation = true;
    return false;
  }
});

// Menu control functions
function toggleMenu() {
  if (!uiGloballyVisible) return; 
    
  const controls = document.getElementById('controls');
  const controlsTab = document.getElementById('controls-tab');
  menuCollapsed = !menuCollapsed;
  
  if (menuCollapsed) {
    controls.classList.add('collapsed');
    controlsTab.classList.add('visible');
    logToConsoleAndUI('Controls menu collapsed (Sliding out right)', 'info');
  } else {
    controls.classList.remove('collapsed');
    controlsTab.classList.remove('visible');
    logToConsoleAndUI('Controls menu expanded (Sliding in right)', 'info');
  }
}

function toggleFilterPanel() {
  if (!uiGloballyVisible) return; 
    
  const panel = document.getElementById('filter-panel');
  const filterTab = document.getElementById('filter-tab');
  filterPanelCollapsed = !filterPanelCollapsed;
  
  if (filterPanelCollapsed) {
    panel.classList.add('collapsed');
    filterTab.classList.add('visible');
    logToConsoleAndUI('Filter panel collapsed (Sliding out left)', 'info');
  } else {
    panel.classList.remove('collapsed');
    filterTab.classList.remove('visible');
    logToConsoleAndUI('Filter panel expanded (Sliding in left)', 'info');
  }
}

function toggleLogPanel() {
  if (!uiGloballyVisible) return; 
    
    const logPanel = document.getElementById('log-panel');
    logPanelVisible = !logPanelVisible;

    if (logPanelVisible) {
        logPanel.style.display = 'block';
        const logOutput = document.getElementById('log-output');
        logOutput.scrollTop = logOutput.scrollHeight;
        logToConsoleAndUI('Log Panel: Visible', 'info');
    } else {
        logPanel.style.display = 'none';
        logToConsoleAndUI('Log Panel: Hidden', 'info');
    }
}

function toggleAllUI() {
  uiGloballyVisible = !uiGloballyVisible;
  const controls = document.getElementById('controls');
  const filterPanel = document.getElementById('filter-panel');
  const controlsTab = document.getElementById('controls-tab');
  const filterTab = document.getElementById('filter-tab');
  const logPanel = document.getElementById('log-panel');
  const labelingIndicator = document.getElementById('labeling-indicator');

  if (uiGloballyVisible) {
      // TURN UI ON
      controls.classList.remove('hidden-by-global');
      filterPanel.classList.remove('hidden-by-global');

      // Restore state
      if (menuWasCollapsed) {
          controls.classList.add('collapsed');
          controlsTab.classList.add('visible');
      } else {
          controls.classList.remove('collapsed');
          controlsTab.classList.remove('visible');
      }

      if (filterWasCollapsed) {
          filterPanel.classList.add('collapsed');
          filterTab.classList.add('visible');
      } else {
          filterPanel.classList.remove('collapsed');
          filterTab.classList.remove('visible');
      }
      
      // Restore log panel visibility if it was active before global hide
      if (logPanelVisible) {
          logPanel.style.display = 'block';
      }
      
      logToConsoleAndUI('All UI restored to previous visibility state. (Toggle with U)', 'info');
      
  } else {
      // TURN UI OFF
      
      // Store current collapse state
      menuWasCollapsed = controls.classList.contains('collapsed');
      filterWasCollapsed = filterPanel.classList.contains('collapsed');

      // Hide panels by forcing them off screen (using !important in CSS)
      controls.classList.add('hidden-by-global');
      filterPanel.classList.add('hidden-by-global');

      // Hide tabs
      controlsTab.classList.remove('visible');
      filterTab.classList.remove('visible');
      
      // Hide log and indicator
      logPanel.style.display = 'none';
      labelingIndicator.style.display = 'none';
      
      // Exit labeling mode if active to prevent accidental label creation
      if (labelingMode) {
           exitLabelingMode(); 
      }
      
      logToConsoleAndUI('All UI globally hidden. (Toggle with U)', 'info');
  }
}

// Labeling functions
function startLabelingMode() {
  if (labelingMode) return;
  labelingMode = true;
  
  // Show labeling indicator
  document.getElementById('labeling-indicator').style.display = 'block';
  
  // Update viewer settings to disable drag/double-click
  viewer.gestureSettingsMouse.dragToPan = false;
  viewer.gestureSettingsMouse.dblClickToZoom = false;
  
  logToConsoleAndUI('Labeling mode active: Click on image to place label', 'info');
}

function exitLabelingMode() {
  if (!labelingMode) return;
  labelingMode = false;
  pendingLabelPosition = null;
  
  // Hide labeling indicator only if UI is globally visible
  if (uiGloballyVisible) {
      document.getElementById('labeling-indicator').style.display = 'none';
  }
  
  // Hide modal if open
  document.getElementById('label-modal').style.display = 'none';
  
  // Restore viewer settings
  viewer.gestureSettingsMouse.dragToPan = true;
  viewer.gestureSettingsMouse.dblClickToZoom = true;
  
  logToConsoleAndUI('Labeling mode deactivated', 'info');
}

function showLabelModal() {
  const modal = document.getElementById('label-modal');
  const textInput = document.getElementById('modal-label-text');
  const colorPicker = document.getElementById('modal-color-picker');
  
  // Reset modal
  textInput.value = '';
  colorPicker.value = '#ff0000';
  updateColorPreview();
  
  // Show modal
  modal.style.display = 'flex';
  
  // Focus text input
  setTimeout(() => textInput.focus(), 100);
  
  // Update color preview when color changes
  colorPicker.oninput = updateColorPreview; 
  
  logToConsoleAndUI('Label creation modal shown', 'info');
}

function updateColorPreview() {
  const colorPicker = document.getElementById('modal-color-picker');
  const preview = document.getElementById('color-preview');
  preview.textContent = colorPicker.value.toUpperCase();
  preview.style.color = colorPicker.value;
}

function confirmLabelCreation() {
  const textInput = document.getElementById('modal-label-text');
  const colorPicker = document.getElementById('modal-color-picker');
  
  const labelText = textInput.value.trim();
  
  if (labelText === '') {
    textInput.focus();
    textInput.style.borderColor = '#ff4444';
    logToConsoleAndUI('Label text required.', 'error'); 
    setTimeout(() => { textInput.style.borderColor = '#555'; }, 2000);
    return;
  }
  
  if (pendingLabelPosition) {
    addLabel(
      pendingLabelPosition.viewportPoint, 
      labelText, 
      colorPicker.value, 
      pendingLabelPosition.rotation
    );
  }
  
  exitLabelingMode();
}

function cancelLabelCreation() {
  logToConsoleAndUI('Label creation canceled', 'info');
  exitLabelingMode();
}

function addLabel(viewportPoint, text, color, rotation) {
  const labelId = 'label_' + (++labelIdCounter);
  
  // Create label data
  const labelData = {
    id: labelId,
    text: text,
    color: color,
    viewportX: viewportPoint.x,
    viewportY: viewportPoint.y,
    originalRotation: rotation,
    type: text 
  };
  
  // Store label data
  labels.push(labelData);
  
  // Update label types for filtering
  if (!labelTypes[text]) {
    labelTypes[text] = {
      name: text,
      color: color,
      visible: true,
      count: 0
    };
  }
  labelTypes[text].count++;
  
  // Create DOM element
  createLabelElement(labelData);
  
  // Update filter panel
  updateFilterPanel();
  
  logToConsoleAndUI(`Added label: "${text}" at (${viewportPoint.x.toFixed(3)}, ${viewportPoint.y.toFixed(3)})`, 'success'); 
}

function createLabelElement(labelData) {
  const labelEl = document.createElement('div');
  labelEl.className = 'image-label';
  labelEl.id = labelData.id;
  labelEl.textContent = labelData.text;
  labelEl.style.borderColor = labelData.color;
  labelEl.style.color = labelData.color;
  
  // Add to viewer container
  document.getElementById('viewer').appendChild(labelEl);
  
  // Position the label
  updateLabelPosition(labelData);
}

function updateLabelPosition(labelData) {
  const labelEl = document.getElementById(labelData.id);
  if (!labelEl) return;
  
  // Convert viewport coordinates to screen coordinates
  const screenPoint = viewer.viewport.pixelFromPoint(new OpenSeadragon.Point(labelData.viewportX, labelData.viewportY));
  
  // Calculate rotation difference
  const currentRotation = viewer.viewport.getRotation();
  const rotationDiff = currentRotation - labelData.originalRotation;
  
  // Position and rotate label
  labelEl.style.left = screenPoint.x + 'px';
  labelEl.style.top = screenPoint.y + 'px';
  labelEl.style.transform = `translate(-50%, -50%) rotate(${rotationDiff}deg)`;
  
  // Show/hide based on filter
  const labelType = labelTypes[labelData.type];
  labelEl.style.display = (labelType && labelType.visible) ? 'block' : 'none';
}

function updateAllLabels() {
  labels.forEach(labelData => {
    updateLabelPosition(labelData);
  });
}

function updateFilterPanel() {
  const filterList = document.getElementById('filter-list');
  
  if (Object.keys(labelTypes).length === 0) {
    filterList.innerHTML = '<div style="font-size: 12px; color: #888; text-align: center; padding: 20px;">No labels yet.<br>Create labels using the controls panel.</div>';
    return;
  }
  
  filterList.innerHTML = '';
  
  Object.values(labelTypes).forEach(labelType => {
    const filterItem = document.createElement('div');
    filterItem.className = 'filter-item' + (labelType.visible ? '' : ' hidden');
    
    filterItem.innerHTML = `
      <div class="filter-item-content" onclick="toggleLabelType('${labelType.name}')">
        <div class="color-sample" style="background-color: ${labelType.color}"></div>
        <span class="filter-label">${labelType.name}</span>
        <span class="label-count">(${labelType.count})</span>
      </div>
      <button class="delete-label-btn" onclick="deleteLabelType('${labelType.name}')" title="Delete all '${labelType.name}' labels">
        ×
      </button>
    `;
    
    filterList.appendChild(filterItem);
  });
}

function toggleLabelType(typeName) {
  if (labelTypes[typeName]) {
    labelTypes[typeName].visible = !labelTypes[typeName].visible;
    updateAllLabels();
    updateFilterPanel();
    logToConsoleAndUI(`Toggled visibility for "${typeName}": ${labelTypes[typeName].visible ? 'Visible' : 'Hidden'}`, 'info');
  }
}

function deleteLabelType(typeName) {
  const labelType = labelTypes[typeName];
  if (!labelType) return;
  
  const count = labelType.count;
  const confirmMessage = count === 1 
    ? `Delete the "${typeName}" label?`
    : `Delete all ${count} "${typeName}" labels?`;
  
  if (!confirm(confirmMessage)) return;
  
  // Find and remove all labels of this type
  const labelsToRemove = labels.filter(label => label.type === typeName);
  
  labelsToRemove.forEach(labelData => {
    // Remove DOM element
    const labelEl = document.getElementById(labelData.id);
    if (labelEl) labelEl.remove();
    
    // Remove from labels array
    const index = labels.indexOf(labelData);
    if (index > -1) labels.splice(index, 1);
  });
  
  // Remove from labelTypes
  delete labelTypes[typeName];
  
  // Update filter panel
  updateFilterPanel();
  
  logToConsoleAndUI(`Deleted ${labelsToRemove.length} "${typeName}" labels`, 'info');
}

function clearAllLabels() {
  if (labels.length === 0) {
    logToConsoleAndUI('No labels to clear.', 'info');
    return;
  }
  
  if (confirm(`Delete all ${labels.length} labels?`)) {
    // Remove all label elements
    labels.forEach(labelData => {
      const labelEl = document.getElementById(labelData.id);
      if (labelEl) labelEl.remove();
    });
    
    // Clear data
    labels = [];
    labelTypes = {};
    labelIdCounter = 0;
    
    // Update filter panel
    updateFilterPanel();
    
    logToConsoleAndUI('All labels cleared', 'info');
  }
}

function exportLabels() {
  if (labels.length === 0) {
    logToConsoleAndUI('No labels to export', 'error'); 
    return;
  }
  
  const exportData = {
    timestamp: new Date().toISOString(),
    imageRotation: viewer.viewport.getRotation(),
    labels: labels.map(label => ({
      text: label.text,
      color: label.color,
      x: label.viewportX,
      y: label.viewportY,
      rotation: label.originalRotation
    }))
  };
  
  const dataStr = JSON.stringify(exportData, null, 2);
  const dataBlob = new Blob([dataStr], {type: 'application/json'});
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(dataBlob);
  link.download = `nasa-image-labels_${new Date().getTime()}.json`;
  link.click();
  
  logToConsoleAndUI(`Exported ${labels.length} labels to JSON`, 'success'); 
}

// Control functions
function toggleSmoothing() {
  smoothingEnabled = !smoothingEnabled;
  const toggleSwitch = document.getElementById('smoothing-toggle');
  
  if (smoothingEnabled) {
    toggleSwitch.classList.add('active');
  } else {
    toggleSwitch.classList.remove('active');
  }
  
  if (viewer.drawer && viewer.drawer.context) {
    viewer.drawer.context.imageSmoothingEnabled = smoothingEnabled;
    viewer.drawer.context.imageSmoothingQuality = smoothingEnabled ? 'high' : 'low';
    viewer.forceRedraw();
  }
  logToConsoleAndUI('Image smoothing: ' + (smoothingEnabled ? 'enabled' : 'disabled'), 'info');
}

function resetView() {
  viewer.viewport.goHome(true);
  viewer.viewport.setRotation(homeRotation);
  logToConsoleAndUI('View reset to home position and rotation', 'info');
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    // Enter fullscreen
    document.documentElement.requestFullscreen().then(() => {
      logToConsoleAndUI('Entered fullscreen', 'info');
    }).catch(err => {
      logToConsoleAndUI(`Error entering fullscreen: ${err.message}`, 'error'); 
    });
  } else {
    // Exit fullscreen
    document.exitFullscreen().then(() => {
      logToConsoleAndUI('Exited fullscreen', 'info');
    });
  }
}

/**
 * Saves the current view of the OpenSeadragon viewer, 
 * including all overlaid labels, into a single image file (PNG).
 */
function saveImageWithLabels() {
    logToConsoleAndUI('Attempting to save image with labels...', 'info'); 

    const viewerElement = document.getElementById('viewer');
    const controls = document.getElementById('controls');
    const filterPanel = document.getElementById('filter-panel');
    const logPanel = document.getElementById('log-panel');
    const controlsTab = document.getElementById('controls-tab');
    const filterTab = document.getElementById('filter-tab');

    // 1. Temporarily hide UI elements
    const uiElements = [controls, filterPanel, logPanel, controlsTab, filterTab];
    uiElements.forEach(el => {
        if (el) {
            el.style.visibility = 'hidden';
        }
    });

    // 2. Use html2canvas to capture the entire #viewer element
    if (typeof html2canvas !== 'undefined') {
        html2canvas(viewerElement, {
            logging: false, 
            useCORS: true, 
            allowTaint: true 
        }).then(canvas => {
            // 3. Create a temporary link element to trigger the download
            const link = document.createElement('a');
            link.download = 'nasa-annotated-image.png'; 
            link.href = canvas.toDataURL('image/png'); 

            // 4. Append and trigger click
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            logToConsoleAndUI('Image saved successfully.', 'success'); 
        }).catch(error => {
            logToConsoleAndUI('Error saving image: ' + error.message, 'error'); 
            console.error('html2canvas error:', error);
        }).finally(() => {
            // 5. Always restore UI element visibility
            uiElements.forEach(el => {
                if (el) {
                    el.style.visibility = 'visible';
                }
            });
        });
    } else {
        logToConsoleAndUI('Error: html2canvas library is required for image saving but not found.', 'error'); 
        alert('Image saving failed. Please ensure the html2canvas library is loaded.');
        
        // Restore UI visibility in case of error before finally block
        uiElements.forEach(el => {
            if (el) {
                el.style.visibility = 'visible';
            }
        });
    }
}

// NEW FUNCTION: Handles the user file upload
async function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) {
    logToConsoleAndUI('No file selected.', 'error'); 
    return;
  }
  
  const allowedTypes = ['image/jpeg', 'image/png', 'image/tiff'];
  const isAllowed = allowedTypes.includes(file.type) || file.name.toLowerCase().match(/\.(jpg|jpeg|png|tiff)$/);

  if (!isAllowed) {
    logToConsoleAndUI('Unsupported file type. Please use JPG, PNG, or TIFF.', 'error'); 
    event.target.value = null; 
    return;
  }
  
  logToConsoleAndUI(`Processing image: ${file.name}. This may take a moment for large files...`, 'info');

  const formData = new FormData();
  formData.append('file', file);

  try {
    // 1. Send file to the FastAPI server for DZI processing
    const response = await fetch('http://127.0.0.1:8000/upload_image/', {
      method: 'POST',
      body: formData,
    });
    
    event.target.value = null; 

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || `Server error: ${response.status}`);
    }

    const data = await response.json();
    const dziUrl = data.dzi_url;

    // 2. Clear all existing labels
    labels.forEach(labelData => {
      const labelEl = document.getElementById(labelData.id);
      if (labelEl) labelEl.remove();
    });
    labels = [];
    labelTypes = {};
    labelIdCounter = 0;
    updateFilterPanel();
    logToConsoleAndUI('All labels cleared before new image load.', 'info');
    
    // 3. Clear log and exit any active modes
    exitLabelingMode(); 
    
    // 4. Load the new DZI using OpenSeadragon's open method
    viewer.open(dziUrl);
    logToConsoleAndUI(`✅ Image processed and loaded from: ${dziUrl}`, 'success'); 
    
  } catch (error) {
    logToConsoleAndUI(`❌ Image upload/processing failed: ${error.message}`, 'error'); 
    console.error("Upload/Processing Error:", error);
  }
}


// Initial startup messages (Moved initialization to DOMContentLoaded)
document.addEventListener('DOMContentLoaded', () => {
    
    // The viewer object is created in the global scope, but we check if it exists 
    // to ensure post-initialization logic runs.
    if (viewer) {
        viewer.raiseEvent('open'); 
    }

    logToConsoleAndUI('Enhanced NASA Image Viewer loading...', 'info');
    logToConsoleAndUI('Log Panel is currently hidden (Toggle with \\ key)', 'info');
    logToConsoleAndUI('Active shortcuts: R=Reset, F=Fullscreen, S=Toggle Smoothing, M=Toggle Menu, L=Add Label, N=Toggle Filter, \\=Toggle Log, U=Toggle All UI, X=Rotate CW, Z=Rotate CCW, ESC=Cancel Labeling', 'info');

    // Attach color preview update logic
    const colorPicker = document.getElementById('modal-color-picker');
    const colorPreview = document.getElementById('color-preview');
    if (colorPicker && colorPreview) {
        colorPicker.addEventListener('input', updateColorPreview);
        updateColorPreview(); // Initial call
    }
    
    // Set initial toggle state for smoothing
    const smoothingToggle = document.getElementById('smoothing-toggle');
    if (smoothingToggle) {
        if (smoothingEnabled) {
            smoothingToggle.classList.add('active');
        } else {
            smoothingToggle.classList.remove('active');
        }
    }
});