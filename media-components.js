/* media-components.js - Renders different media types inside workspace windows */

import { focusWindow } from './window-manager.js';

// Parses normal YouTube/Vimeo URLs into standard embeds
function parseVideoUrl(url) {
    if (!url) return '';
    
    // Youtube URL parsing (matches watch, shorts, embed, youtu.be)
    const ytReg = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const ytMatch = url.match(ytReg);
    if (ytMatch) {
        return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&rel=0`;
    }
    
    // Vimeo URL parsing
    const vimReg = /vimeo\.com\/(?:video\/)?([0-9]+)/;
    const vimMatch = url.match(vimReg);
    if (vimMatch) {
        return `https://player.vimeo.com/video/${vimMatch[1]}?autoplay=0`;
    }
    
    return url;
}

// Icon mapper for different window types
const iconMap = {
    video: 'video',
    map: 'map',
    picture: 'image',
    document: 'file-text'
};

const defaultTitles = {
    video: 'Video Stream',
    map: 'Interactive Map',
    picture: 'Picture Viewer',
    document: 'Live Notepad'
};

export function createWindowElement(winData, onUpdate, onDelete) {
    const { id, type, title, url = '', content = '', x, y, width, height, zIndex } = winData;
    
    // Create Main window outer wrapper
    const win = document.createElement('div');
    win.className = `deck-window ${type}-deck-window`;
    win.id = id;
    win.style.left = `${x}px`;
    win.style.top = `${y}px`;
    win.style.width = `${width}px`;
    win.style.height = `${height}px`;
    win.style.zIndex = zIndex || 10;
    
    const iconName = iconMap[type] || 'window';
    const displayTitle = title || defaultTitles[type] || 'Window';
    
    // Window header & controls structure
    win.innerHTML = `
        <div class="window-header">
            <div class="window-title-area type-${type}">
                <i data-lucide="${iconName}"></i>
                <span class="window-title" id="${id}-title-text">${displayTitle}</span>
            </div>
            <div class="window-controls">
                <button class="win-control-btn edit-btn" title="Edit Settings">
                    <i data-lucide="settings"></i>
                </button>
                <button class="win-control-btn close-btn" title="Close Window">
                    <i data-lucide="x"></i>
                </button>
            </div>
        </div>
        
        <div class="window-content" id="${id}-content-area">
            <!-- Media content rendered here -->
        </div>
        
        <div class="resize-handle"></div>
        
        <!-- Glassmorphism settings overlay -->
        <div class="edit-overlay" id="${id}-edit-overlay">
            <div class="edit-form">
                <h4 class="edit-form-title">Edit Window Settings</h4>
                
                <div class="form-group">
                    <label for="${id}-title-input">Window Title</label>
                    <input type="text" id="${id}-title-input" class="form-control" value="${displayTitle}">
                </div>
                
                <div class="form-media-fields" id="${id}-media-fields-container">
                    <!-- Fields injected dynamically based on type -->
                </div>
                
                <div class="form-actions">
                    <button class="btn btn-secondary btn-cancel" id="${id}-btn-cancel">Cancel</button>
                    <button class="btn btn-primary btn-save" id="${id}-btn-save">Apply</button>
                </div>
            </div>
        </div>
    `;
    
    // Inject Media Content into Window
    const contentArea = win.querySelector(`#${id}-content-area`);
    renderMediaContent(type, contentArea, url, content, winData);
    
    // Inject correct inputs into Settings Form
    const fieldsContainer = win.querySelector(`#${id}-media-fields-container`);
    injectSettingsFields(type, fieldsContainer, url, content, id);
    
    // Initialize Lucide icons on this element
    lucide.createIcons({
        attrs: {
            class: 'lucide-icon'
        },
        nameAttr: 'data-lucide',
        node: win
    });
    
    // Hook up Event Listeners
    const editBtn = win.querySelector('.edit-btn');
    const closeBtn = win.querySelector('.close-btn');
    const editOverlay = win.querySelector(`#${id}-edit-overlay`);
    const btnCancel = win.querySelector(`#${id}-btn-cancel`);
    const btnSave = win.querySelector(`#${id}-btn-save`);
    
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        focusWindow(win);
        editOverlay.classList.add('active');
        // If there's an input inside, focus on it
        const firstInput = editOverlay.querySelector('.form-control');
        if (firstInput) firstInput.focus();
    });
    
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        win.remove();
        onDelete(id);
    });
    
    btnCancel.addEventListener('click', (e) => {
        e.stopPropagation();
        editOverlay.classList.remove('active');
        // Restore form fields
        win.querySelector(`#${id}-title-input`).value = win.querySelector(`#${id}-title-text`).textContent;
        const urlInput = win.querySelector(`#${id}-url-input`);
        if (urlInput) urlInput.value = url;
    });
    
    btnSave.addEventListener('click', (e) => {
        e.stopPropagation();
        const newTitle = win.querySelector(`#${id}-title-input`).value.trim();
        const urlInput = win.querySelector(`#${id}-url-input`);
        const newUrl = urlInput ? urlInput.value.trim() : url;
        
        win.querySelector(`#${id}-title-text`).textContent = newTitle;
        winData.title = newTitle;
        winData.url = newUrl;
        
        // Re-render content based on updated URL
        renderMediaContent(type, contentArea, newUrl, winData.content, winData);
        
        editOverlay.classList.remove('active');
        onUpdate(winData);
    });
    
    // Custom logic for live typing in document note editors
    if (type === 'document') {
        const textarea = contentArea.querySelector('textarea');
        if (textarea) {
            textarea.addEventListener('input', (e) => {
                winData.content = e.target.value;
                onUpdate(winData); // Saves state in real-time on input
            });
        }
    }
    
    // Handle File upload if picture upload is selected
    if (type === 'picture') {
        const fileInput = win.querySelector(`#${id}-file-upload`);
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const dataUrl = evt.target.result;
                    win.querySelector(`#${id}-url-input`).value = dataUrl;
                    
                    // Automatically trigger Apply save
                    win.querySelector(`#${id}-title-text`).textContent = file.name.split('.')[0] || 'Image';
                    winData.title = win.querySelector(`#${id}-title-text`).textContent;
                    winData.url = dataUrl;
                    
                    renderMediaContent('picture', contentArea, dataUrl, '', winData);
                    editOverlay.classList.remove('active');
                    onUpdate(winData);
                };
                reader.readAsDataURL(file);
            });
        }
    }
    
    return win;
}

// Renders the correct inner DOM nodes inside the media container
function renderMediaContent(type, container, url, content, winData) {
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'media-container';
    
    switch (type) {
        case 'video':
            const embedUrl = parseVideoUrl(url);
            if (embedUrl) {
                // Check if it's embed or raw media
                if (embedUrl.includes('youtube.com') || embedUrl.includes('player.vimeo.com') || embedUrl.includes('embed')) {
                    wrapper.innerHTML = `<iframe src="${embedUrl}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
                } else {
                    wrapper.innerHTML = `<video src="${embedUrl}" controls autoplay muted></video>`;
                }
            } else {
                wrapper.innerHTML = `
                    <div class="pdf-placeholder">
                        <i data-lucide="video-off"></i>
                        <p>No video source configured. Click settings to add a URL.</p>
                    </div>
                `;
            }
            break;
            
        case 'map':
            // Renders dynamic Leaflet map using OpenStreetMap tiles
            const mapDiv = document.createElement('div');
            mapDiv.className = 'map-container';
            wrapper.appendChild(mapDiv);
            container.appendChild(wrapper);
            
            // Initialize Leaflet map
            let lat = 37.7749; // San Francisco default
            let lng = -122.4194;
            let zoom = 12;
            
            if (url) {
                const parts = url.split(',');
                if (parts.length >= 2) {
                    lat = parseFloat(parts[0]) || lat;
                    lng = parseFloat(parts[1]) || lng;
                    if (parts[2]) zoom = parseInt(parts[2]) || zoom;
                }
            }
            
            // Timeout to ensure the DOM elements are attached and size calculations work
            setTimeout(() => {
                try {
                    const map = L.map(mapDiv, {
                        zoomControl: true,
                        attributionControl: false
                    }).setView([lat, lng], zoom);
                    
                    // Dark Matter Tile Layer (very clean & looks incredible in glassmorphism dark theme)
                    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                        maxZoom: 19
                    }).addTo(map);
                    
                    // Attach map instance to container so window manager can invalidateSize on resize
                    mapDiv._leaflet_map = map;
                    
                    // Save map coordinates on map move
                    map.on('moveend', () => {
                        const center = map.getCenter();
                        const currentZoom = map.getZoom();
                        winData.url = `${center.lat.toFixed(6)},${center.lng.toFixed(6)},${currentZoom}`;
                        // Trigger update silently
                        if (winData.url !== url) {
                            url = winData.url;
                            // Call save
                            const layoutChangeEvent = new CustomEvent('layout-update');
                            document.dispatchEvent(layoutChangeEvent);
                        }
                    });
                } catch (e) {
                    console.error("Leaflet init error: ", e);
                }
            }, 50);
            
            return; // Return early since map append is custom
            
        case 'picture':
            if (url) {
                wrapper.innerHTML = `<img src="${url}" class="img-media" alt="User media">`;
            } else {
                wrapper.innerHTML = `
                    <div class="pdf-placeholder">
                        <i data-lucide="image"></i>
                        <p>No picture selected. Double click or press settings to configure.</p>
                    </div>
                `;
            }
            break;
            
        case 'document':
            wrapper.innerHTML = `
                <div class="document-editor-container">
                    <textarea class="document-textarea" placeholder="Start typing notes, guidelines, or paste markdown here...">${content || ''}</textarea>
                </div>
            `;
            break;
            
        default:
            wrapper.innerHTML = `<div>Unknown content type</div>`;
    }
    
    container.appendChild(wrapper);
    lucide.createIcons({ node: container });
}

// Injects the proper fields inside the edit settings panel
function injectSettingsFields(type, container, url, content, id) {
    container.innerHTML = '';
    
    switch (type) {
        case 'video':
            container.innerHTML = `
                <div class="form-group">
                    <label for="${id}-url-input">Video Stream URL</label>
                    <input type="text" id="${id}-url-input" class="form-control" placeholder="YouTube, Vimeo, or raw MP4 video URL" value="${url}">
                </div>
            `;
            break;
            
        case 'map':
            container.innerHTML = `
                <div class="form-group">
                    <label for="${id}-url-input">Coordinates & Zoom</label>
                    <input type="text" id="${id}-url-input" class="form-control" placeholder="latitude,longitude,zoom" value="${url || '37.7749,-122.4194,12'}">
                    <span style="font-size:10px; color:var(--text-secondary); margin-top:2px;">Tip: You can also pan/zoom the map directly to save your position.</span>
                </div>
            `;
            break;
            
        case 'picture':
            container.innerHTML = `
                <div class="form-group">
                    <label for="${id}-url-input">Picture Image URL</label>
                    <input type="text" id="${id}-url-input" class="form-control" placeholder="https://example.com/photo.jpg" value="${url.startsWith('data:') ? '' : url}">
                </div>
                <div class="form-group" style="margin-top: 8px;">
                    <label>Or Upload Local File</label>
                    <div class="file-upload-wrapper">
                        <button class="btn btn-secondary" type="button" style="width:100%;">
                            <i data-lucide="upload-cloud"></i> Choose Local Image File
                        </button>
                        <input type="file" id="${id}-file-upload" accept="image/*">
                    </div>
                </div>
            `;
            break;
            
        case 'document':
            // Documents are edited in real-time, no URL field needed, but let's provide document type if loading dynamic raw URL
            container.innerHTML = `
                <div class="form-group">
                    <label for="${id}-url-input">Import Notes from URL (Optional)</label>
                    <input type="text" id="${id}-url-input" class="form-control" placeholder="https://example.com/notes.txt" value="${url}">
                </div>
            `;
            break;
    }
}
