/* window-manager.js - Draggable and Resizable Window Logic */

let maxZIndex = 10;

export function getNextZIndex() {
    maxZIndex += 1;
    return maxZIndex;
}

export function focusWindow(win) {
    const currentZ = parseInt(win.style.zIndex || '10');
    if (currentZ < maxZIndex) {
        win.style.zIndex = getNextZIndex();
        
        // Highlight active window class
        document.querySelectorAll('.deck-window').forEach(w => w.classList.remove('focused'));
        win.classList.add('focused');
    }
}

export function makeWindowInteractive(win, onLayoutChange) {
    const header = win.querySelector('.window-header');
    const resizeHandle = win.querySelector('.resize-handle');
    
    // Z-Index Focus on click/mousedown inside the window
    win.addEventListener('mousedown', () => {
        focusWindow(win);
    });

    // --- Dragging Logic ---
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragOffsetLeft = 0;
    let dragOffsetTop = 0;

    header.addEventListener('mousedown', (e) => {
        // Only drag with left mouse click, and ignore buttons
        if (e.button !== 0 || e.target.closest('.win-control-btn')) return;
        
        e.preventDefault();
        focusWindow(win);
        
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        
        // Parse left/top as numbers
        dragOffsetLeft = parseInt(win.style.left) || 0;
        dragOffsetTop = parseInt(win.style.top) || 0;
        
        document.addEventListener('mousemove', onMouseMoveDrag);
        document.addEventListener('mouseup', onMouseUpDrag);
    });

    function onMouseMoveDrag(e) {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        
        let newLeft = dragOffsetLeft + dx;
        let newTop = dragOffsetTop + dy;
        
        // Prevent titlebar going under header
        if (newTop < 0) newTop = 0;
        
        win.style.left = `${newLeft}px`;
        win.style.top = `${newTop}px`;
    }

    function onMouseUpDrag() {
        if (isDragging) {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMoveDrag);
            document.removeEventListener('mouseup', onMouseUpDrag);
            if (onLayoutChange) onLayoutChange();
        }
    }

    // --- Resizing Logic ---
    let isResizing = false;
    let resizeStartX = 0;
    let resizeStartY = 0;
    let resizeStartWidth = 0;
    let resizeStartHeight = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation(); // Don't trigger focus/drag
        
        focusWindow(win);
        
        isResizing = true;
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        resizeStartWidth = win.offsetWidth;
        resizeStartHeight = win.offsetHeight;
        
        document.addEventListener('mousemove', onMouseMoveResize);
        document.addEventListener('mouseup', onMouseUpResize);
    });

    function onMouseMoveResize(e) {
        if (!isResizing) return;
        const dx = e.clientX - resizeStartX;
        const dy = e.clientY - resizeStartY;
        
        // Enforce min width/height
        const newWidth = Math.max(260, resizeStartWidth + dx);
        const newHeight = Math.max(180, resizeStartHeight + dy);
        
        win.style.width = `${newWidth}px`;
        win.style.height = `${newHeight}px`;
        
        // If there's a leaflet map inside, invalidate its size to resize properly
        const mapContainer = win.querySelector('.map-container');
        if (mapContainer && mapContainer._leaflet_map) {
            mapContainer._leaflet_map.invalidateSize();
        }
    }

    function onMouseUpResize() {
        if (isResizing) {
            isResizing = false;
            document.removeEventListener('mousemove', onMouseMoveResize);
            document.removeEventListener('mouseup', onMouseUpResize);
            if (onLayoutChange) onLayoutChange();
        }
    }

    // Touch Support for dragging (Mobile/Tablet devices)
    header.addEventListener('touchstart', (e) => {
        if (e.target.closest('.win-control-btn')) return;
        focusWindow(win);
        
        const touch = e.touches[0];
        isDragging = true;
        dragStartX = touch.clientX;
        dragStartY = touch.clientY;
        dragOffsetLeft = parseInt(win.style.left) || 0;
        dragOffsetTop = parseInt(win.style.top) || 0;
        
        const touchMoveHandler = (evt) => {
            if (!isDragging) return;
            const t = evt.touches[0];
            const dx = t.clientX - dragStartX;
            const dy = t.clientY - dragStartY;
            let newLeft = dragOffsetLeft + dx;
            let newTop = dragOffsetTop + dy;
            if (newTop < 0) newTop = 0;
            win.style.left = `${newLeft}px`;
            win.style.top = `${newTop}px`;
        };
        
        const touchEndHandler = () => {
            isDragging = false;
            document.removeEventListener('touchmove', touchMoveHandler);
            document.removeEventListener('touchend', touchEndHandler);
            if (onLayoutChange) onLayoutChange();
        };

        document.addEventListener('touchmove', touchMoveHandler, { passive: false });
        document.addEventListener('touchend', touchEndHandler);
    }, { passive: true });
}
