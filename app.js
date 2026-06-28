/* app.js - Main Application State and Flow Control */

import { makeWindowInteractive, getNextZIndex, focusWindow, setupWindowDragAndDrop } from './window-manager.js';
import { createWindowElement } from './media-components.js';

// Application state
let windowsState = [];
let libraryState = [];
const workspaceCanvas = document.getElementById('workspace-canvas');

// Safe Base64 Unicode encoding helpers
function safeB64Encode(str) {
    try {
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
            return String.fromCharCode(parseInt(p1, 16));
        }));
    } catch (e) {
        console.error("Base64 Encoding Error:", e);
        return "";
    }
}

function safeB64Decode(str) {
    try {
        return decodeURIComponent(Array.prototype.map.call(atob(str), (c) => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
    } catch (e) {
        console.error("Base64 Decoding Error:", e);
        return "";
    }
}

// Generates dynamic window dimensions and offsets to prevent stacking
function getNextWindowPosition(type) {
    const width = 460;
    const height = 320;
    
    // Find a spot that doesn't overlap completely
    const offset = 40;
    let count = windowsState.filter(w => w.type === type).length;
    
    // Calculate cascade position
    let x = 60 + (count * offset) % 300;
    let y = 80 + (count * offset) % 200;
    
    // Distribute by types initially
    if (type === 'map') { x += 500; }
    else if (type === 'picture') { x += 500; y += 360; }
    else if (type === 'document') { y += 360; }
    
    return { x, y, width, height };
}

// Saves current workspace configuration & library to localStorage and updates URL Hash
function saveWorkspaceState(updateHash = true) {
    const freshState = [];
    
    // Read current layout coordinates from visual DOM elements
    document.querySelectorAll('.deck-window').forEach(winEl => {
        const id = winEl.id;
        const matchingState = windowsState.find(w => w.id === id);
        
        if (matchingState) {
            freshState.push({
                id: id,
                type: matchingState.type,
                title: matchingState.title,
                url: matchingState.url,
                content: matchingState.content,
                x: parseInt(winEl.style.left) || 0,
                y: parseInt(winEl.style.top) || 0,
                width: winEl.offsetWidth,
                height: winEl.offsetHeight,
                zIndex: parseInt(winEl.style.zIndex) || 10
            });
        }
    });
    
    windowsState = freshState;
    
    // Pack windows and library together
    const fullState = {
        windows: windowsState,
        library: libraryState
    };
    
    localStorage.setItem('planit_layout', JSON.stringify(fullState));
    
    if (updateHash) {
        try {
            const stateStr = JSON.stringify(fullState);
            const encoded = safeB64Encode(stateStr);
            if (encoded && encoded.length < 8000) { // Limit URL length to keep robust
                // Silent hash update
                history.replaceState(null, '', `#deck=${encoded}`);
            } else {
                // Too large for URL (due to custom base64 files), clear hash to avoid errors
                history.replaceState(null, '', window.location.pathname);
            }
        } catch (e) {
            console.error("Failed to update URL hash with state: ", e);
        }
    }
    
    // Manage empty state helper view
    toggleEmptyStatePlaceholder();
}

// Renders a single window element on the canvas
function renderWindow(winData) {
    const winEl = createWindowElement(
        winData,
        // On Update callback
        (updatedData) => {
            const index = windowsState.findIndex(w => w.id === updatedData.id);
            if (index !== -1) windowsState[index] = updatedData;
            saveWorkspaceState();
        },
        // On Delete callback
        (deletedId) => {
            windowsState = windowsState.filter(w => w.id !== deletedId);
            saveWorkspaceState();
        }
    );
    
    workspaceCanvas.appendChild(winEl);
    makeWindowInteractive(winEl, () => saveWorkspaceState());
    
    // Set up HTML5 Drag and Drop target handler
    setupWindowDragAndDrop(winEl, (asset) => {
        // Morph the window type and content to match the dropped asset
        winData.type = asset.type;
        winData.title = asset.title;
        winData.url = asset.url || '';
        winData.content = asset.content || '';
        
        // Grab current physical coordinates
        const oldZ = parseInt(winEl.style.zIndex) || 10;
        winData.x = parseInt(winEl.style.left) || 0;
        winData.y = parseInt(winEl.style.top) || 0;
        winData.width = winEl.offsetWidth;
        winData.height = winEl.offsetHeight;
        winData.zIndex = oldZ;
        
        // Re-render
        winEl.remove();
        renderWindow(winData);
        
        saveWorkspaceState();
        showToast(`Loaded "${asset.title}" into window!`);
    });
}

// Renders the Asset Library sidebar list
function renderLibraryList() {
    const container = document.getElementById('library-list');
    container.innerHTML = '';
    
    if (libraryState.length === 0) {
        container.innerHTML = `<div class="pdf-placeholder" style="padding:10px 0;"><p style="font-size:12px; color:var(--text-muted);">Library is empty. Import files or add links to begin.</p></div>`;
        return;
    }
    
    const iconMap = {
        video: 'video',
        map: 'map',
        picture: 'image',
        document: 'file-text'
    };
    
    libraryState.forEach(asset => {
        const item = document.createElement('div');
        item.className = 'library-item';
        item.draggable = true;
        
        const iconName = iconMap[asset.type] || 'file';
        
        item.innerHTML = `
            <div class="library-item-info type-${asset.type}">
                <i data-lucide="${iconName}"></i>
                <span class="library-item-name" title="${asset.title}">${asset.title}</span>
            </div>
            <button class="library-item-delete" title="Delete Asset">
                <i data-lucide="trash-2"></i>
            </button>
        `;
        
        // Handle Drag Start
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify(asset));
            e.dataTransfer.effectAllowed = 'copy';
            item.style.opacity = '0.5';
        });
        
        item.addEventListener('dragend', () => {
            item.style.opacity = '1';
        });
        
        // Handle Delete Asset
        item.querySelector('.library-item-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            libraryState = libraryState.filter(x => x.id !== asset.id);
            renderLibraryList();
            saveWorkspaceState();
        });
        
        container.appendChild(item);
    });
    
    lucide.createIcons({ node: container });
}

// Clears workspace canvas entirely
function clearWorkspace() {
    workspaceCanvas.innerHTML = '';
    windowsState = [];
    saveWorkspaceState();
}

// Adds a new window dynamically
function addWindow(type, customData = null) {
    const id = `deck-win-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const position = getNextWindowPosition(type);
    
    let defaultUrl = '';
    let defaultContent = '';
    
    if (type === 'video') defaultUrl = 'https://www.youtube.com/watch?v=5qap5aO4i9A'; // Lofi Beats stream
    if (type === 'map') defaultUrl = '37.7749,-122.4194,12'; // SF default
    if (type === 'picture') defaultUrl = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800'; // Beach landscape
    if (type === 'document') defaultContent = '# Notes\n- Add your list item here\n- Double click title or click settings gear to customize this window.';
    
    const newWindow = Object.assign({
        id,
        type,
        title: '',
        url: defaultUrl,
        content: defaultContent,
        x: position.x,
        y: position.y,
        width: position.width,
        height: position.height,
        zIndex: getNextZIndex()
    }, customData || {});
    
    windowsState.push(newWindow);
    renderWindow(newWindow);
    
    const newlyCreated = document.getElementById(id);
    if (newlyCreated) focusWindow(newlyCreated);
    
    saveWorkspaceState();
}

// Builds the default workspace demonstration
function loadDefaultWorkspace() {
    // 1. Initial Windows
    const defaultDeck = [
        {
            id: 'win-default-video',
            type: 'video',
            title: 'Lofi Relaxing Stream',
            url: 'https://www.youtube.com/watch?v=5qap5aO4i9A',
            x: 40,
            y: 30,
            width: 480,
            height: 330,
            zIndex: 11
        },
        {
            id: 'win-default-map',
            type: 'map',
            title: 'San Francisco Map Viewer',
            url: '37.7749,-122.4194,13',
            x: 550,
            y: 30,
            width: 480,
            height: 330,
            zIndex: 12
        },
        {
            id: 'win-default-doc',
            type: 'document',
            title: 'Project Workspace Notes',
            content: `Welcome to PlanIT! 🚀

This is a premium multi-window media hub. 

How to use:
1. Drag windows by their header bars to arrange.
2. Resize windows by the drag handle at the bottom-right.
3. Click the settings gear icon on any window to edit URLs, titles, coordinate strings, or upload local images.
4. Click "Share Layout" to copy a URL that saves your configuration! When someone opens the link, they'll see this exact setup.
5. Export/Import layouts using the Package options on the control bar.`,
            x: 40,
            y: 390,
            width: 480,
            height: 320,
            zIndex: 13
        },
        {
            id: 'win-default-pic',
            type: 'picture',
            title: 'Workspace Inspiration',
            url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800',
            x: 550,
            y: 390,
            width: 480,
            height: 320,
            zIndex: 14
        }
    ];
    
    defaultDeck.forEach(w => {
        windowsState.push(w);
        renderWindow(w);
    });
    
    // 2. Initial Asset Library
    libraryState = [
        {
            id: 'demo-asset-lofi',
            type: 'video',
            title: 'Chill Synthwave Stream',
            url: 'https://www.youtube.com/watch?v=4xDzrJKvOOY',
            content: ''
        },
        {
            id: 'demo-asset-paris',
            type: 'map',
            title: 'Paris, France Map',
            url: '48.8566,2.3522,12',
            content: ''
        },
        {
            id: 'demo-asset-tokyo',
            type: 'map',
            title: 'Tokyo, Japan Map',
            url: '35.6764,139.6500,11',
            content: ''
        },
        {
            id: 'demo-asset-ny',
            type: 'picture',
            title: 'New York Skyline',
            url: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800',
            content: ''
        },
        {
            id: 'demo-asset-todo',
            type: 'document',
            title: 'Team Agenda Notes',
            url: '',
            content: `# Weekly Agenda\n\n- [ ] Deploy client updates\n- [ ] Review coordinate systems\n- [ ] Check asset library file imports`
        }
    ];
    
    renderLibraryList();
    saveWorkspaceState(false);
}

// Utility to show placeholder text if workspace is empty
function toggleEmptyStatePlaceholder() {
    let emptyEl = document.getElementById('empty-state-msg');
    
    if (windowsState.length === 0) {
        if (!emptyEl) {
            emptyEl = document.createElement('div');
            emptyEl.className = 'empty-state';
            emptyEl.id = 'empty-state-msg';
            emptyEl.innerHTML = `
                <i data-lucide="layout-template" class="empty-icon"></i>
                <h3>Your Workspace is Empty</h3>
                <p>Add fresh media tiles using the "Add Window" action in the header to configure your layout.</p>
                <button class="btn btn-primary" id="empty-state-load-demo">
                    <i data-lucide="sparkles"></i> Load Demo Layout
                </button>
            `;
            workspaceCanvas.appendChild(emptyEl);
            lucide.createIcons({ node: emptyEl });
            
            document.getElementById('empty-state-load-demo').addEventListener('click', () => {
                emptyEl.remove();
                loadDefaultWorkspace();
            });
        }
    } else {
        if (emptyEl) emptyEl.remove();
    }
}

// Displays Toast Alert Popup
function showToast(message, isSuccess = true) {
    const toast = document.getElementById('toast-notification');
    const toastMsg = toast.querySelector('.toast-msg');
    const toastIcon = toast.querySelector('.toast-icon');
    
    toastMsg.textContent = message;
    
    if (isSuccess) {
        toast.style.borderColor = 'var(--accent-green)';
        toastIcon.style.color = 'var(--accent-green)';
        toastIcon.setAttribute('data-lucide', 'check-circle');
    } else {
        toast.style.borderColor = 'var(--accent-red)';
        toastIcon.style.color = 'var(--accent-red)';
        toastIcon.setAttribute('data-lucide', 'alert-circle');
    }
    
    lucide.createIcons({ node: toast });
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2800);
}

// Initial Loading Logic: URL Hash check -> LocalStorage check -> Default loading
function initWorkspace() {
    const hash = window.location.hash;
    
    let toLoad = null;
    
    if (hash && hash.startsWith('#deck=')) {
        try {
            const rawData = hash.substring(6);
            const decodedJson = safeB64Decode(rawData);
            if (decodedJson) {
                toLoad = JSON.parse(decodedJson);
            }
        } catch (e) {
            console.error("Failed to parse workspace URL state: ", e);
            showToast('Failed to load shared workspace link.', false);
        }
    }
    
    // Fallback: LocalStorage
    if (!toLoad) {
        const cached = localStorage.getItem('planit_layout');
        if (cached) {
            try {
                toLoad = JSON.parse(cached);
            } catch (e) {
                console.error("Cached layout failed to load: ", e);
            }
        }
    }
    
    // Load parsed content
    if (toLoad) {
        clearWorkspace();
        let windowsList = [];
        let libraryList = [];
        
        // Handle backwards compatibility (older exports are raw window arrays)
        if (Array.isArray(toLoad)) {
            windowsList = toLoad;
        } else {
            windowsList = toLoad.windows || [];
            libraryList = toLoad.library || [];
        }
        
        windowsState = windowsList;
        libraryState = libraryList;
        
        windowsState.forEach(winData => {
            renderWindow(winData);
        });
        
        renderLibraryList();
        saveWorkspaceState(false);
        
        if (hash && hash.startsWith('#deck=')) {
            showToast('Shared workspace layout loaded!');
        }
        return;
    }
    
    // Final fallback: Load default demo
    loadDefaultWorkspace();
}

// Hook Header Actions Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Dropdown toggle
    const addWinBtn = document.getElementById('add-window-btn');
    const addWinMenu = document.getElementById('add-window-menu');
    
    addWinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addWinMenu.parentNode.classList.toggle('active');
    });
    
    // Handle dropdown clicks
    addWinMenu.querySelectorAll('a').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const type = item.getAttribute('data-type');
            addWindow(type);
            addWinMenu.parentNode.classList.remove('active');
        });
    });
    
    // Close dropdown on click outside
    document.addEventListener('click', () => {
        addWinMenu.parentNode.classList.remove('active');
    });
    
    // Sidebar toggle panel
    const sidebarPanel = document.getElementById('sidebar-panel');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    
    sidebarToggleBtn.addEventListener('click', () => {
        sidebarPanel.classList.toggle('collapsed');
        // If there are Leaflet maps, force resize invalidate
        setTimeout(() => {
            document.querySelectorAll('.map-container').forEach(mapDiv => {
                if (mapDiv._leaflet_map) {
                    mapDiv._leaflet_map.invalidateSize();
                }
            });
        }, 300);
    });
    
    // Sidebar File Import trigger
    const libImportBtn = document.getElementById('lib-import-btn');
    const libFileInput = document.getElementById('lib-file-input');
    
    libImportBtn.addEventListener('click', () => {
        libFileInput.click();
    });
    
    libFileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        
        let loadedCount = 0;
        
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            const isImg = file.type.startsWith('image/');
            
            reader.onload = (evt) => {
                const content = isImg ? '' : evt.target.result;
                const url = isImg ? evt.target.result : '';
                const type = isImg ? 'picture' : 'document';
                
                const newAsset = {
                    id: `asset-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    type,
                    title: file.name.split('.')[0] || file.name,
                    url,
                    content
                };
                
                libraryState.push(newAsset);
                loadedCount++;
                
                if (loadedCount === files.length) {
                    renderLibraryList();
                    saveWorkspaceState();
                    showToast(`Imported ${files.length} file(s) successfully!`);
                }
            };
            
            if (isImg) {
                reader.readAsDataURL(file);
            } else {
                reader.readAsText(file);
            }
        });
        
        // Clear input value so same files can be selected again
        libFileInput.value = '';
    });
    
    // Sidebar Add Custom Link Dialog
    const libAddLinkBtn = document.getElementById('lib-add-link-btn');
    libAddLinkBtn.addEventListener('click', () => {
        const title = prompt("Enter asset title (e.g., Paris Map, Tech Talk Video):");
        if (!title || !title.trim()) return;
        
        const url = prompt("Enter asset URL (YouTube watch link, Image URL, or Lat,Lng,Zoom coordinates):");
        if (!url || !url.trim()) return;
        
        // Deduce type based on URL
        let type = 'picture';
        const lowercaseUrl = url.toLowerCase();
        
        if (lowercaseUrl.includes('youtube.com') || lowercaseUrl.includes('youtu.be') || lowercaseUrl.includes('vimeo.com') || lowercaseUrl.endsWith('.mp4')) {
            type = 'video';
        } else if (url.split(',').length >= 2) {
            type = 'map';
        }
        
        const newAsset = {
            id: `asset-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            type,
            title: title.trim(),
            url: url.trim(),
            content: ''
        };
        
        libraryState.push(newAsset);
        renderLibraryList();
        saveWorkspaceState();
        showToast(`Added custom link: "${newAsset.title}"`);
    });
    
    // Share Layout Link Trigger
    document.getElementById('share-workspace-btn').addEventListener('click', () => {
        saveWorkspaceState(true);
        const shareLink = window.location.href;
        
        navigator.clipboard.writeText(shareLink).then(() => {
            showToast('Shareable layout link copied to clipboard!');
        }).catch(err => {
            console.error('Could not copy link: ', err);
            showToast('Failed to copy link. Copy URL manually.', false);
        });
    });
    
    // JSON package Export Trigger
    document.getElementById('export-btn').addEventListener('click', () => {
        saveWorkspaceState();
        
        const fullState = {
            windows: windowsState,
            library: libraryState
        };
        
        const dataStr = JSON.stringify(fullState, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = 'planit-workspace-package.json';
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        showToast('Workspace package JSON file exported!');
    });
    
    // JSON package Import Trigger
    const fileInputTrigger = document.getElementById('import-btn-trigger');
    const fileInput = document.getElementById('import-file-input');
    
    fileInputTrigger.addEventListener('click', () => {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const parsed = JSON.parse(evt.target.result);
                
                clearWorkspace();
                let windowsList = [];
                let libraryList = [];
                
                if (Array.isArray(parsed)) {
                    windowsList = parsed;
                } else if (parsed && parsed.windows) {
                    windowsList = parsed.windows;
                    libraryList = parsed.library || [];
                } else {
                    showToast('Invalid workspace file structure.', false);
                    return;
                }
                
                windowsState = windowsList;
                libraryState = libraryList;
                
                windowsState.forEach(winData => {
                    renderWindow(winData);
                });
                
                renderLibraryList();
                saveWorkspaceState();
                showToast('Workspace layout package imported successfully!');
            } catch (err) {
                console.error("Failed to import file: ", err);
                showToast('Failed to parse file. Ensure it is a valid package JSON.', false);
            }
        };
        reader.readAsText(file);
        // Clear input value so same file can be selected again
        fileInput.value = '';
    });
    
    // Clear Workspace Trigger
    document.getElementById('clear-btn').addEventListener('click', () => {
        if (confirm("Are you sure you want to remove all windows in the workspace?")) {
            clearWorkspace();
            showToast('Workspace cleared.');
        }
    });
    
    // Custom events trigger map/re-layouts saves
    document.addEventListener('layout-update', () => {
        saveWorkspaceState();
    });
    
    // Initialize Lucide icons on core UI
    lucide.createIcons();
    
    // Init workspace load
    initWorkspace();
});
