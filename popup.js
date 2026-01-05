// X Spam Filter - Popup Script

// DOM Elements
const toggleSwitch = document.getElementById('toggleSwitch');
const hiddenCountEl = document.getElementById('hiddenCount');
const sensitivitySlider = document.getElementById('sensitivitySlider');
const sliderLabels = document.querySelectorAll('.slider-labels span');
const resetBtn = document.getElementById('resetBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

// Sensitivity mapping
const sensitivityMap = ['low', 'medium', 'high'];

// Initialize popup
async function init() {
  await loadSettings();
  setupEventListeners();
  updateSliderBackground();
}

// Load settings from storage
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['enabled', 'sensitivity', 'hiddenToday']);
    
    // Update toggle
    const isEnabled = result.enabled !== false;
    updateToggleUI(isEnabled);
    
    // Update sensitivity slider
    const sensitivity = result.sensitivity || 'medium';
    const sliderValue = sensitivityMap.indexOf(sensitivity);
    sensitivitySlider.value = sliderValue >= 0 ? sliderValue : 1;
    updateSliderLabels(sensitivitySlider.value);
    updateSliderBackground();
    
    // Update counter
    hiddenCountEl.textContent = result.hiddenToday || 0;
    
    // Check if on X/Twitter
    await checkActiveTab();
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Check if currently on X/Twitter
async function checkActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && (tab.url?.includes('x.com') || tab.url?.includes('twitter.com'))) {
      statusDot.classList.remove('disabled');
      statusText.textContent = 'Extension active on X';
    } else {
      statusDot.classList.add('disabled');
      statusText.textContent = 'Not on X/Twitter';
    }
  } catch (error) {
    statusDot.classList.add('disabled');
    statusText.textContent = 'Status unknown';
  }
}

// Update toggle UI
function updateToggleUI(isEnabled) {
  if (isEnabled) {
    toggleSwitch.classList.add('active');
    statusDot.classList.remove('disabled');
  } else {
    toggleSwitch.classList.remove('active');
    statusDot.classList.add('disabled');
    statusText.textContent = 'Filter disabled';
  }
}

// Update slider labels
function updateSliderLabels(value) {
  sliderLabels.forEach((label, index) => {
    if (index === parseInt(value)) {
      label.classList.add('active');
    } else {
      label.classList.remove('active');
    }
  });
}

// Update slider background gradient
function updateSliderBackground() {
  const value = sensitivitySlider.value;
  const percentage = (value / 2) * 100;
  sensitivitySlider.style.setProperty('--value', `${percentage}%`);
}

// Setup event listeners
function setupEventListeners() {
  // Toggle switch
  toggleSwitch.addEventListener('click', async () => {
    const isCurrentlyActive = toggleSwitch.classList.contains('active');
    const newState = !isCurrentlyActive;
    
    // Save to storage
    await chrome.storage.local.set({ enabled: newState });
    
    // Update UI
    updateToggleUI(newState);
    
    // Notify content script
    await sendMessageToContentScript({
      type: 'toggleEnabled',
      enabled: newState
    });
  });
  
  // Sensitivity slider
  sensitivitySlider.addEventListener('input', () => {
    updateSliderLabels(sensitivitySlider.value);
    updateSliderBackground();
  });
  
  sensitivitySlider.addEventListener('change', async () => {
    const sensitivity = sensitivityMap[sensitivitySlider.value];
    
    // Save to storage
    await chrome.storage.local.set({ sensitivity });
    
    // Notify content script
    await sendMessageToContentScript({
      type: 'sensitivityChanged',
      sensitivity
    });
  });
  
  // Slider label clicks
  sliderLabels.forEach(label => {
    label.addEventListener('click', async () => {
      const value = label.dataset.value;
      sensitivitySlider.value = value;
      updateSliderLabels(value);
      updateSliderBackground();
      
      const sensitivity = sensitivityMap[value];
      await chrome.storage.local.set({ sensitivity });
      
      await sendMessageToContentScript({
        type: 'sensitivityChanged',
        sensitivity
      });
    });
  });
  
  // Reset button
  resetBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({ hiddenToday: 0 });
    hiddenCountEl.textContent = '0';
  });
}

// Send message to content script
async function sendMessageToContentScript(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && (tab.url?.includes('x.com') || tab.url?.includes('twitter.com'))) {
      chrome.tabs.sendMessage(tab.id, message);
    }
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

// Refresh counter periodically
setInterval(async () => {
  const result = await chrome.storage.local.get(['hiddenToday']);
  hiddenCountEl.textContent = result.hiddenToday || 0;
}, 2000);

// Initialize
init();
