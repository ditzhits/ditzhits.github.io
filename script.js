document.addEventListener('DOMContentLoaded', () => {
    const mapSvgContainer = document.getElementById('map-svg-container'); // Updated ID
    const categoryFiltersContainer = document.getElementById('category-filters');
    const vendorListContainer = document.getElementById('vendor-list-container');
    const searchBar = document.getElementById('search-bar');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    const modal = document.getElementById('vendor-modal');
    const modalCloseBtn = document.querySelector('.modal-close-btn');
    const mapLabelToggleButton = document.getElementById('map-label-toggle-btn');
    const loadingIndicator = document.querySelector('.loading-indicator');

    let vendorData = {};
    let svgDoc; // This will be the <svg> HTML element
    let currentMapLabelType = 'id';
    let activeCategoryButton = null;
    let selectedVendorItemInList = null;
    let focusedVendorId = null;

    const CATEGORY_COLORS = {
        // From your CSV
        "toys": "#FF4500",
        "collectibles": "#FF69B4",
        "games": "#DA70D6",
        "fashion apparel": "#6c5ce7",
        "custom jewelry": "#FFD700",
        "accessories": "#FFD700",
        "trading cards": "#ff6b6b",
        "y2k/vintage": "#FF7F50",
        "pottery": "#A0522D",
        "natural stones": "#d79456",
        "computers": "#4682B4",
        "candles": "#FFA500",
        "psychic": "#8A2BE2",
        "personal body care": "#20B2AA",
        "sports": "#ff8c00",

        // For Amenities and Default
        "amenities": "#B0E0E6",        // PowderBlue (Light, neutral)
        "unknown": "#A9A9A9"           // DarkGray (Good neutral default)
    };

    function getCategoryColor(category) {
        const lowerCategory = category ? category.toLowerCase().trim() : 'unknown'; // Handle null/undefined category

        // 1. Check if the category is explicitly defined in CATEGORY_COLORS
        if (CATEGORY_COLORS.hasOwnProperty(lowerCategory)) {
            return CATEGORY_COLORS[lowerCategory];
        }

        // 2. If not defined, use the HSL generation algorithm as the default
        let hash = 0;
        // Use a slightly more robust seed for empty or very short strings
        const strToHash = lowerCategory.length > 2 ? lowerCategory : lowerCategory + "defaultSeed";

        for (let i = 0; i < strToHash.length; i++) {
            hash = strToHash.charCodeAt(i) + ((hash << 5) - hash);
            hash = hash & hash; // Convert to 32bit integer
        }

        const h = Math.abs(hash % 360); // Hue (0-359)
        // Using slightly adjusted saturation and lightness for better vibrancy and contrast on dark theme
        const s = 65 + (Math.abs(hash % 10)); // Saturation between 65-75%
        const l = 55 + (Math.abs(hash % 11) - 5); // Lightness between 50-60%

        return `hsl(${h}, ${s}%, ${l}%)`;
    }

    async function loadData() {
        console.log("loadData called");
        if (loadingIndicator) loadingIndicator.style.display = 'block';
        try {
            const [svgResponse, jsonResponse] = await Promise.all([
                fetch('mall_map.svg'),
                fetch('vendors.json')
            ]);

            console.log("SVG Response Status:", svgResponse.status, "JSON Response Status:", jsonResponse.status);

            if (!svgResponse.ok) {
                throw new Error(`Failed to load SVG: ${svgResponse.status} ${svgResponse.statusText}`);
            }
            if (!jsonResponse.ok) {
                 // You could choose to proceed with map only, or throw error
                console.warn(`Failed to load vendor JSON: ${jsonResponse.status} ${jsonResponse.statusText}. Map may be limited.`);
                vendorData = {}; // Ensure vendorData is an empty object
            }

            const svgText = await svgResponse.text();
            console.log("SVG Text loaded (length):", svgText.length);

            if (jsonResponse.ok) {
                try {
                    vendorData = await jsonResponse.json();
                    console.log("Vendor Data Loaded:", Object.keys(vendorData).length, "vendors");
                } catch (jsonError) {
                    console.error("Error parsing vendor JSON:", jsonError);
                    vendorListContainer.innerHTML = "<p>Error parsing vendor data.</p>";
                    vendorData = {}; // Ensure vendorData is an empty object on error
                }
            }

            const parser = new DOMParser();
            const parsedSvgDocument = parser.parseFromString(svgText, "image/svg+xml");
            const LsvgDoc = parsedSvgDocument.documentElement; // The <svg> element

            if (LsvgDoc.tagName === "parsererror" || !LsvgDoc.querySelector('rect, polygon, circle, path')) { // Basic check
                console.error("Error parsing SVG or SVG seems empty/invalid.");
                const errorDetails = LsvgDoc.querySelector("parsererror")?.textContent || "Unknown SVG parsing error";
                console.error("SVG Parser Error Details:", errorDetails);
                throw new Error(`Error parsing SVG map: ${errorDetails}`);
            }

            svgDoc = LsvgDoc; // Assign to global svgDoc
            svgDoc.id = "mall-svg-element"; // Ensure the SVG has the ID for CSS targeting

            // Selectively remove only the loading indicator if it exists
            const currentLoadingIndicator = mapSvgContainer.querySelector('.loading-indicator');
            if (currentLoadingIndicator) {
                currentLoadingIndicator.remove(); // Or mapSvgContainer.removeChild(currentLoadingIndicator);
            }
            // Any other specific elements you might want to clear from mapSvgContainer before adding SVG go here.
            // For instance, if there was a previous SVG map:
            const oldSvg = mapSvgContainer.querySelector('svg#mall-svg-element');
            if (oldSvg) {
                oldSvg.remove();
            }

            mapSvgContainer.appendChild(svgDoc);
            console.log("SVG Document Element appended to container:", svgDoc);

            initializeMapInteractions();
            populateCategories();
            populateVendorList();
            addGlobalEventListeners();

        } catch (error) {
            console.error("Error in loadData function:", error);
            mapSvgContainer.innerHTML = `<p style="color:red; padding:20px;">Critical Error: ${error.message}. Check console and file paths.</p>`;
        } finally {
            if (loadingIndicator) loadingIndicator.style.display = 'none';
        }
    }

    function bringToFront(svgElement) {
        if (svgElement && svgElement.parentNode) {
            svgElement.parentNode.appendChild(svgElement);
        }
    }

    function initializeMapInteractions() { // Was initializeMap
        if (!svgDoc) return;
        const shapes = svgDoc.querySelectorAll('.store-shape');

        shapes.forEach(shape => {
            const vendorId = shape.id;
            const vendor = vendorData[vendorId];
            if (vendor) { // Apply category color
                const primaryCategory = vendor['@type']?.[0] || 'unknown';
                shape.style.fill = getCategoryColor(primaryCategory);
            } else {
                shape.style.fill = getCategoryColor();
            }

            shape.addEventListener('click', () => handleMapShapeClick(vendorId));

            shape.addEventListener('mouseover', () => {
                if (shape.classList.contains('dimmed') || shape.classList.contains('highlighted')) return;

                bringToFront(shape); // 1. Shape
                const contentId = currentMapLabelType === 'id' ? `content-text-${vendorId}` : `content-logo-${vendorId}`;
                const contentElement = svgDoc.getElementById(contentId);
                if (contentElement) {
                    bringToFront(contentElement); // 2. Its content
                }
            });
        });

        updateMapContentDisplay(currentMapLabelType); // Initial display of IDs or Logos

        if (mapLabelToggleButton) { // Set initial button text
            mapLabelToggleButton.textContent = currentMapLabelType === 'id' ? 'Show Logos' : 'Show IDs';
        }
    }

    // Function to calculate the centroid of a polygon
    function getPolygonCentroid(ptsString) {
        // ptsString is the "points" attribute string like "x1,y1 x2,y2 x3,y3 ..."
        const pts = ptsString.split(/\s+|,/) // Split by space or comma, handles "x,y" or "x y"
                    .map(Number)
                    .filter(p => !isNaN(p)); // Remove any NaNs if parsing fails

        if (pts.length < 6 || pts.length % 2 !== 0) { // Need at least 3 points (6 coordinates)
            console.warn("Invalid points string for polygon centroid:", ptsString);
            return null; // Or fallback to BBox center
        }

        let area = 0;
        let cx = 0;
        let cy = 0;
        let i, j;

        for (i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
            const xi = pts[i];
            const yi = pts[i+1];
            const xj = pts[j];
            const yj = pts[j+1];

            const crossProduct = (xi * yj) - (xj * yi);
            area += crossProduct;
            cx += (xi + xj) * crossProduct;
            cy += (yi + yj) * crossProduct;
        }
        area /= 2;

        if (Math.abs(area) < 1e-6) { // Polygon has zero area (e.g., collinear points)
            console.warn("Polygon has near-zero area, cannot calculate centroid accurately:", ptsString);
            // Fallback: Average of points (not ideal, but better than NaN/Infinity)
            let sumX = 0, sumY = 0;
            for(let k=0; k < pts.length; k+=2) {
                sumX += pts[k];
                sumY += pts[k+1];
            }
            return { x: sumX / (pts.length/2), y: sumY / (pts.length/2) };
        }

        cx = cx / (6 * area);
        cy = cy / (6 * area);

        return { x: cx, y: cy };
    }

    function getShapeCenter(shape) {
        const shapeId = shape.id;
        const tagName = shape.tagName.toLowerCase();

        // 1. Check for a specific label anchor element
        //    The anchor element MUST be part of the loaded svgDoc
        if (shapeId && svgDoc) { // Ensure svgDoc is defined and accessible here
            const anchorId = `${shapeId}-label-anchor`;
            const anchorElement = svgDoc.getElementById(anchorId);

            if (anchorElement) {
                const anchorTagName = anchorElement.tagName.toLowerCase();
                if (anchorTagName === 'circle' && anchorElement.hasAttribute('cx') && anchorElement.hasAttribute('cy')) {
                    // For circles, cx/cy is the center. Must convert to number.
                    // Note: these are in the circle's local coordinates. If the circle or its parents are transformed,
                    // this simple cx,cy might not be the final screen position.
                    // A more robust way for transformed anchors is to use getBBox() on the anchor itself.
                    const anchorBBox = anchorElement.getBBox();
                    return { x: anchorBBox.x + anchorBBox.width / 2, y: anchorBBox.y + anchorBBox.height / 2 };
                } else if (anchorTagName === 'rect' && anchorElement.hasAttribute('x') && anchorElement.hasAttribute('y')) {
                    // For rects, x + width/2, y + height/2 is the center.
                    // Using getBBox() on the anchor is generally safer as it accounts for transforms.
                    const anchorBBox = anchorElement.getBBox();
                    return { x: anchorBBox.x + anchorBBox.width / 2, y: anchorBBox.y + anchorBBox.height / 2 };
                } else {
                    // For other anchor types, or if cx/cy/x/y are missing, use its BBox center
                    try {
                        const anchorBBox = anchorElement.getBBox();
                        if (anchorBBox) {
                            return { x: anchorBBox.x + anchorBBox.width / 2, y: anchorBBox.y + anchorBBox.height / 2 };
                        }
                    } catch (e) {
                        console.warn(`Could not get BBox for anchor element ${anchorId}`, e);
                    }
                }
            }
        }

        // 2. If no anchor, try polygon centroid (if it's a polygon)
        if (tagName === 'polygon') {
            const pointsAttr = shape.getAttribute('points');
            if (pointsAttr) {
                const centroid = getPolygonCentroid(pointsAttr); // Assumes getPolygonCentroid is defined
                if (centroid) {
                    const bbox = shape.getBBox();
                    if (bbox && centroid.x >= bbox.x && centroid.x <= bbox.x + bbox.width &&
                        centroid.y >= bbox.y && centroid.y <= bbox.y + bbox.height) {
                        return centroid;
                    }
                    // Fall through to BBox if centroid outside or BBox invalid
                }
            }
        }

        // 3. Fallback to the shape's own BBox center (for rect, path, circle, or failed polygon/anchor)
        try {
            const bbox = shape.getBBox();
            if (!bbox || (bbox.width === 0 && bbox.height === 0 && tagName !== 'circle' && tagName !== 'line')) {
                console.warn("getBBox returned zero/invalid dimensions for main shape:", shapeId, "tagName:", tagName);
                if (tagName === 'rect' && shape.hasAttribute('x') && shape.hasAttribute('y') && shape.hasAttribute('width') && shape.hasAttribute('height')) {
                    return {
                        x: parseFloat(shape.getAttribute('x')) + parseFloat(shape.getAttribute('width')) / 2,
                        y: parseFloat(shape.getAttribute('y')) + parseFloat(shape.getAttribute('height')) / 2
                    };
                }
                return { x: 0, y: 0 };
            }
            return {
                x: bbox.x + bbox.width / 2,
                y: bbox.y + bbox.height / 2
            };
        } catch (e) {
            console.error("Error in getBBox for main shape:", shapeId, "tagName:", tagName, e);
            return { x: 0, y: 0 };
        }
    }

    function displayContentOnShape(shape, vendorId, displayType) { // displayType is 'id' or 'logo'
        if (!svgDoc || !shape) return;

        const vendor = vendorData[vendorId];
        const center = getShapeCenter(shape); // Your working getShapeCenter

        const textContentId = `content-text-${vendorId}`;
        const logoContentId = `content-logo-${vendorId}`;

        const existingText = svgDoc.getElementById(textContentId);
        if (existingText) existingText.remove();
        const existingLogo = svgDoc.getElementById(logoContentId);
        if (existingLogo) existingLogo.remove();

        let elementToDisplay = null;

        if (displayType === 'id') {
            elementToDisplay = document.createElementNS("http://www.w3.org/2000/svg", "text");
            elementToDisplay.setAttribute("id", textContentId);
            elementToDisplay.setAttribute("x", center.x);
            elementToDisplay.setAttribute("y", center.y);
            elementToDisplay.setAttribute("class", "store-map-content store-text"); // CSS will handle font-size
            elementToDisplay.textContent = vendorId;
            // NO JavaScript font sizing for IDs here
        } else if (displayType === 'logo') {
            // ... (logo creation logic remains the same as your last working version)
            if (vendor && vendor.logo) {
                elementToDisplay = document.createElementNS("http://www.w3.org/2000/svg", "image");
                elementToDisplay.setAttribute("id", logoContentId);
                elementToDisplay.setAttributeNS("http://www.w3.org/1999/xlink", "href", vendor.logo);
                elementToDisplay.setAttribute("class", "store-map-content store-logo");

                const shapeBBox = shape.getBBox(); // Still need BBox for logo sizing
                if (shapeBBox && shapeBBox.width > 0 && shapeBBox.height > 0) {
                    const PADDING_RATIO = 0.15;
                    let targetW = shapeBBox.width * (1 - PADDING_RATIO * 2);
                    let targetH = shapeBBox.height * (1 - PADDING_RATIO * 2);
                    let finalSize = Math.min(targetW, targetH);
                    finalSize = Math.max(5, finalSize);

                    elementToDisplay.setAttribute("width", finalSize);
                    elementToDisplay.setAttribute("height", finalSize);
                    elementToDisplay.setAttribute("x", center.x - finalSize / 2);
                    elementToDisplay.setAttribute("y", center.y - finalSize / 2);
                } else {
                    elementToDisplay.setAttribute("width", "20"); elementToDisplay.setAttribute("height", "20");
                    elementToDisplay.setAttribute("x", center.x - 10); elementToDisplay.setAttribute("y", center.y - 10);
                }
            } else {
                elementToDisplay = null; // No logo, display nothing
            }
        }

        if (elementToDisplay) {
            (shape.parentNode || svgDoc).appendChild(elementToDisplay);
        }
    }

    function updateMapContentDisplay(newDisplayType) {
        if (!svgDoc) return;
        currentMapLabelType = newDisplayType; // Update global state
        const shapes = svgDoc.querySelectorAll('.store-shape');
        shapes.forEach(shape => {
            displayContentOnShape(shape, shape.id, newDisplayType);
        });
    }

    function addTextLabelToShape(shape, vendorId, type = currentMapLabelType) {
        if (!svgDoc) return;
        const existingText = svgDoc.getElementById(`text-${vendorId}`);
        if (existingText) existingText.remove();

        const vendor = vendorData[vendorId];
        if (!vendor && type === 'name') return; // Don't add name label if no vendor

        const center = getShapeCenter(shape);
        const textElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
        textElement.setAttribute("id", `text-${vendorId}`);
        textElement.setAttribute("x", center.x);
        textElement.setAttribute("y", center.y);
        textElement.setAttribute("class", "store-text");

        let labelContent = vendorId;
        if (type === 'name' && vendor && vendor.name) {
            // Smart abbreviation for names
            const nameParts = vendor.name.split(' ');
            if (vendor.name.length > 12 && nameParts.length > 1) {
                labelContent = nameParts.map(p => p[0]).join('').toUpperCase();
                if (labelContent.length > 4) labelContent = labelContent.substring(0,4);
            } else if (vendor.name.length > 10) {
                 labelContent = vendor.name.substring(0, 8) + "...";
            } else {
                labelContent = vendor.name;
            }
        }
        textElement.textContent = labelContent;

        const bbox = shape.getBBox();
        const minDim = Math.min(bbox.width, bbox.height);
        let fontSize = Math.max(5, Math.min(14, minDim / (labelContent.length > 5 ? 4.5 : 3.5)));
        if (labelContent.length > 10) fontSize *= 0.7;
        textElement.setAttribute("font-size", `${fontSize}px`);

        // Insert text after the shape so it's rendered on top, but within SVG structure
        shape.parentNode.appendChild(textElement); // Append to parent of shape
    }

    function updateMapLabels(type) {
        if (!svgDoc) return;
        currentMapLabelType = type;
        const shapes = svgDoc.querySelectorAll('.store-shape');
        shapes.forEach(shape => {
            const vendorId = shape.id;
            addTextLabelToShape(shape, vendorId, type);
        });
    }

    function populateCategories() {
        const allCategories = new Set();
        Object.values(vendorData).forEach(vendor => {
            if (vendor['@type']) {
                vendor['@type'].forEach(cat => allCategories.add(cat.toLowerCase()));
            }
        });

        const sortedCategories = Array.from(allCategories).sort();
        categoryFiltersContainer.innerHTML = '';

        const allBtn = document.createElement('button');
        allBtn.classList.add('category-btn');
        allBtn.textContent = 'All Categories';
        allBtn.dataset.category = 'all';
        allBtn.addEventListener('click', () => handleCategorySelect('all', allBtn));
        categoryFiltersContainer.appendChild(allBtn);

        sortedCategories.forEach(category => {
            const btn = document.createElement('button');
            btn.classList.add('category-btn');
            btn.textContent = category.charAt(0).toUpperCase() + category.slice(1);
            btn.dataset.category = category;
            btn.style.backgroundColor = getCategoryColor(category) || CATEGORY_COLORS.unknown;
            btn.addEventListener('click', () => handleCategorySelect(category, btn));
            categoryFiltersContainer.appendChild(btn);
        });
        // Activate "All Categories" by default
        if (allBtn) handleCategorySelect('all', allBtn);
    }

    function populateVendorList(filterCategory = 'all', searchTerm = '') {
        vendorListContainer.innerHTML = ''; // Clear existing list
        let count = 0;

        Object.entries(vendorData).forEach(([id, vendor]) => {
            if (!vendor.name) return; // Skip items without names

            const vendorItem = document.createElement('div');
            vendorItem.classList.add('vendor-item-v2'); // New class for the new style
            vendorItem.dataset.vendorId = id;

            // 1. Logo
            const logoEl = document.createElement('img');
            logoEl.classList.add('vendor-item-logo-v2');
            const logoSrc = vendor.logo || `https://placehold.co/45x45/555/ccc?text=${vendor.name ? vendor.name[0] : '?'}`;
            logoEl.src = logoSrc;
            logoEl.alt = vendor.name;
            logoEl.onerror = function() { this.src = `https://placehold.co/45x45/555/ccc?text=${vendor.name ? vendor.name[0] : '?'}`; this.onerror=null; };
            vendorItem.appendChild(logoEl);

            // 2. Info Container (for Name and Category Tags)
            const infoContainer = document.createElement('div');
            infoContainer.classList.add('vendor-item-info-v2');

            const nameEl = document.createElement('p');
            nameEl.classList.add('vendor-item-name-v2');
            nameEl.textContent = vendor.name;
            infoContainer.appendChild(nameEl);

            if (vendor['@type'] && vendor['@type'].length > 0) {
                const categoryTagsContainer = document.createElement('div');
                categoryTagsContainer.classList.add('vendor-item-category-tags-v2');
                vendor['@type'].slice(0, 3).forEach(catType => { // Show max 3 category tags
                    const tag = document.createElement('span');
                    tag.classList.add('vendor-category-tag-list'); // Re-use/adapt modal tag style or new one
                    tag.textContent = catType;
                    categoryTagsContainer.appendChild(tag);
                });
                infoContainer.appendChild(categoryTagsContainer);
            }
            vendorItem.appendChild(infoContainer);

            // 3. Location ID Bubble
            const locationEl = document.createElement('span');
            locationEl.classList.add('vendor-item-location-v2');
            locationEl.textContent = id;
            vendorItem.appendChild(locationEl);

            // Event listener
            vendorItem.addEventListener('click', () => handleVendorListSelect(id, vendorItem));

            // Dimming logic (same as before)
            let isDimmedByFilter = false;
            if (filterCategory && filterCategory !== 'all') {
                const categories = vendor['@type'] ? vendor['@type'].map(c => c.toLowerCase()) : [];
                if (!categories.includes(filterCategory)) isDimmedByFilter = true;
            }
            if (searchTerm && !isDimmedByFilter) {
                const searchLower = searchTerm.toLowerCase();
                const nameLower = vendor.name.toLowerCase();
                const idLower = id.toLowerCase();
                const descLower = vendor.description ? vendor.description.toLowerCase() : '';
                const catsLower = vendor['@type'] ? vendor['@type'].join(' ').toLowerCase() : '';
                if (!nameLower.includes(searchLower) && !idLower.includes(searchLower) &&
                    !descLower.includes(searchLower) && !catsLower.includes(searchLower)) {
                    isDimmedByFilter = true;
                }
            }
            if (focusedVendorId) {
                if (id === focusedVendorId) {
                    vendorItem.classList.remove('dimmed');
                    vendorItem.classList.add('selected-in-list');
                    if(selectedVendorItemInList && selectedVendorItemInList !== vendorItem) selectedVendorItemInList.classList.remove('selected-in-list');
                    selectedVendorItemInList = vendorItem;
                } else {
                    vendorItem.classList.add('dimmed');
                    vendorItem.classList.remove('selected-in-list');
                }
            } else {
                if (isDimmedByFilter) vendorItem.classList.add('dimmed');
            }

            vendorListContainer.appendChild(vendorItem);
            count++;
        });

        if (count === 0 && (filterCategory !== 'all' || searchTerm)) {
            vendorListContainer.innerHTML = `<p style="padding: 20px; text-align: center; color: var(--text-on-dark-secondary);">No vendors match.</p>`;
        } else if (count === 0) {
            vendorListContainer.innerHTML = `<p style="padding: 20px; text-align: center; color: var(--text-on-dark-secondary);">No vendors found.</p>`;
        }
    }

    function handleCategorySelect(category, clickedButton) {
        clearFocusStateAndApplyGeneralFilters(); // Clear any active focus first

        // --- Existing category button logic ---
        if (activeCategoryButton === clickedButton && category !== 'all') {
            activeCategoryButton.classList.remove('active');
            category = 'all';
            const allCatBtn = categoryFiltersContainer.querySelector('.category-btn[data-category="all"]');
            if (allCatBtn) {
                activeCategoryButton = allCatBtn;
                activeCategoryButton.classList.add('active');
            } else { activeCategoryButton = null; }
        } else {
            if (activeCategoryButton) activeCategoryButton.classList.remove('active');
            activeCategoryButton = clickedButton;
            activeCategoryButton.classList.add('active');
        }

        const categoryButtons = categoryFiltersContainer.querySelectorAll('.category-btn');
        categoryButtons.forEach(btn => {
            if (btn !== activeCategoryButton) {
                btn.classList.add('inactive');
            } else {
                btn.classList.remove('inactive');
            }
        });
        if(category === 'all'){
            categoryButtons.forEach(btn => btn.classList.remove('inactive'));
            // Ensure "All" button itself is active if it was the source
            const allBtnEnsureActive = categoryFiltersContainer.querySelector('.category-btn[data-category="all"]');
            if (allBtnEnsureActive && activeCategoryButton === allBtnEnsureActive) {
                allBtnEnsureActive.classList.add('active');
            }

        }
        // --- End of existing category button logic ---

        const currentSearchTerm = searchBar.value;
        // `filterMapAndList` is now called by `clearFocusStateAndApplyGeneralFilters` if needed,
        // or directly if no focus was active.
        // Let's ensure it's always called to reflect the category change.
        filterMapAndList(category, currentSearchTerm);
    }

    function clearVendorListSelection() {
        if (selectedVendorItemInList) {
            selectedVendorItemInList.classList.remove('selected-in-list');
            selectedVendorItemInList = null;
        }
    }

    function handleVendorListSelect(vendorId, listItemElement) {
        if (focusedVendorId === vendorId && selectedVendorItemInList === listItemElement) {
            // Clicked on the already focused/selected vendor: Unfocus it
            clearFocusStateAndApplyGeneralFilters(); // This function reverts everything
            return; // Important to exit after unfocusing
        }
        focusedVendorId = vendorId; // Set the globally focused vendor

        // Dim all other list items and highlight the selected one
        vendorListContainer.querySelectorAll('.vendor-item-v2').forEach(item => {
            if (item.dataset.vendorId === vendorId) {
                item.classList.remove('dimmed');
                item.classList.add('selected-in-list');
                if (selectedVendorItemInList && selectedVendorItemInList !== item) {
                    selectedVendorItemInList.classList.remove('selected-in-list');
                }
                selectedVendorItemInList = listItemElement;
            } else {
                item.classList.add('dimmed'); // Dim other list items
                item.classList.remove('selected-in-list');
            }
        });

        // Highlight on map: make all others dim
        highlightFocusedVendorOnMap(vendorId);
    }

    function handleMapShapeClick(vendorId) {
        const vendor = vendorData[vendorId];
        if (vendor && vendor.name) {
            focusedVendorId = vendorId;
            showVendorModal(vendorId);

            const listItemForMapClick = vendorListContainer.querySelector(`.vendor-item-v2[data-vendor-id="${vendorId}"]`);
            vendorListContainer.querySelectorAll('.vendor-item-v2').forEach(item => {
                if (item.dataset.vendorId === vendorId) {
                    item.classList.remove('dimmed');
                    item.classList.add('selected-in-list');
                    if (selectedVendorItemInList && selectedVendorItemInList !== item) {
                        selectedVendorItemInList.classList.remove('selected-in-list');
                    }
                    selectedVendorItemInList = listItemForMapClick; // Use the found list item
                    if(listItemForMapClick) listItemForMapClick.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } else {
                    item.classList.add('dimmed');
                    item.classList.remove('selected-in-list');
                }
            });
            highlightFocusedVendorOnMap(vendorId);
        } else if (vendor) { // Amenities
            focusedVendorId = vendorId;
            highlightFocusedVendorOnMap(vendorId);
            if (selectedVendorItemInList) {
                selectedVendorItemInL<ctrl61>list.remove('selected-in-list');
                selectedVendorItemInList = null;
            }
            vendorListContainer.querySelectorAll('.vendor-item-v2').forEach(item => {
                item.classList.add('dimmed');
            });
        }
    }

    // function to highlight the focused vendor and dim ALL others on map
    function highlightFocusedVendorOnMap(selectedVendorId) {
        if (!svgDoc) return;
        svgDoc.querySelectorAll('.store-shape').forEach(shape => {
            const vendor = vendorData[shape.id];
            if (shape.id === selectedVendorId) {
                shape.classList.remove('dimmed');
                shape.classList.add('highlighted');
                if (vendor) shape.style.fill = getCategoryColor(vendor['@type']?.[0]) || CATEGORY_COLORS.unknown;
                else shape.style.fill = CATEGORY_COLORS.unknown;

                bringToFront(shape); // 1. Shape
                const contentId = currentMapLabelType === 'id' ? `content-text-${selectedVendorId}` : `content-logo-${selectedVendorId}`;
                const contentElement = svgDoc.getElementById(contentId);
                if (contentElement) {
                    bringToFront(contentElement); // 2. Its content
                }
            } else {
                shape.classList.remove('highlighted');
                shape.classList.add('dimmed');
            }
        });
    }

    // NEW function to clear the focused state and revert to general filters
    function clearFocusStateAndApplyGeneralFilters() {
        focusedVendorId = null;
        if (selectedVendorItemInList) {
            selectedVendorItemInList.classList.remove('selected-in-list');
            selectedVendorItemInList = null;
        }
        // vendorListContainer.querySelectorAll('.vendor-item.dimmed').forEach(item => item.classList.remove('dimmed'));
        // vendorListContainer.querySelectorAll('.vendor-item.selected-in-list').forEach(item => item.classList.remove('selected-in-list'));


        if (svgDoc) {
            svgDoc.querySelectorAll('.store-shape.highlighted').forEach(s => s.classList.remove('highlighted'));
            svgDoc.querySelectorAll('.store-shape.dimmed').forEach(s => s.classList.remove('dimmed')); // Remove general dimming
        }

        const currentCategory = activeCategoryButton ? activeCategoryButton.dataset.category : 'all';
        const currentSearch = searchBar.value;
        filterMapAndList(currentCategory, currentSearch); // Re-apply general filters (which will dim map and list appropriately)
    }

    function getTodaysHours(vendorHoursArray) {
        if (!vendorHoursArray || vendorHoursArray.length === 0) return "Not Available";

        const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        return vendorHoursArray[today] || 'Closed';
    }

    function showVendorModal(vendorId) {
        const vendor = vendorData[vendorId];
        if (!vendor) return;

        // Header Profile
        const logoSrc = vendor.logo || `https://placehold.co/70x70/383838/EAEAEA?text=${vendor.name ? vendor.name[0] : '?'}`;
        document.getElementById('modal-logo').src = logoSrc;
        document.getElementById('modal-logo').alt = vendor.name || 'Vendor Logo';
        document.getElementById('modal-logo').onerror = function() { this.src = `https://placehold.co/70x70/383838/EAEAEA?text=${vendor.name ? vendor.name[0] : '?'}`; this.onerror=null; };

        document.getElementById('modal-name').textContent = vendor.name || 'N/A';

        const categoryTagsContainer = document.getElementById('modal-category-tags');
        categoryTagsContainer.innerHTML = ''; // Clear previous tags
        if (vendor['@type'] && vendor['@type'].length > 0) {
            vendor['@type'].slice(0, 4).forEach(catType => { // Show max 4 category tags
                const tag = document.createElement('span');
                tag.classList.add('category-tag');
                tag.textContent = catType;
                // Optional: if you want tag colors to match map category colors:
                // tag.style.backgroundColor = getCategoryColor(catType);
                // You might need a helper to ensure text color contrasts with dynamic bg
                categoryTagsContainer.appendChild(tag);
            });
        }

        // Description
        document.getElementById('modal-description').textContent = vendor.description || 'No description available.';

        // Location & Today's Hours
        document.getElementById('modal-location').textContent = vendorId; // Booth number is the location
        document.getElementById('modal-today-hours').textContent = getTodaysHours(vendor.hours); // Use helper

        // Weekly Hours
        const weeklyHoursGrid = document.getElementById('modal-weekly-hours-grid');
        weeklyHoursGrid.innerHTML = ''; // Clear previous
        if (vendor.hours && vendor.hours.length > 0) {
            vendor.hours.forEach(hourEntry => {
                // Assuming format "Day Open-Close" e.g., "Fri 3pm-9pm"
                const parts = hourEntry.match(/^(\w+)\s+(.*)$/); // Simple split: Day and TheRest
                if (parts && parts.length === 3) {
                    const day = parts[1];
                    const time = parts[2];
                    const item = document.createElement('div');
                    item.classList.add('weekly-hour-item');
                    item.innerHTML = `<span>${day}</span><span>${time}</span>`;
                    weeklyHoursGrid.appendChild(item);
                } else { // Fallback for non-matching format
                    const item = document.createElement('div');
                    item.classList.add('weekly-hour-item');
                    item.innerHTML = `<span></span><span>${hourEntry}</span>`; // Display full string if format unknown
                    weeklyHoursGrid.appendChild(item);
                }
            });
        } else {
            weeklyHoursGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">Hours not available.</p>';
        }

        // Contact
        const telephoneEl = document.getElementById('modal-telephone');
        if (vendor.telephone) {
            telephoneEl.textContent = vendor.telephone;
            telephoneEl.parentElement.style.display = 'flex'; // Show the P tag for phone
        } else {
            telephoneEl.textContent = 'N/A';
            telephoneEl.parentElement.style.display = 'none'; // Hide if no phone
        }

        const websiteLink = document.getElementById('modal-website');
        const websiteP = websiteLink.closest('.website-link'); // Get the parent P with class 'website-link'
        if (vendor.url) {
            websiteLink.href = vendor.url;
            websiteLink.textContent = vendor.url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0]; // Display domain
            if (websiteP) websiteP.style.display = 'flex';
        } else {
            if (websiteP) websiteP.style.display = 'none';
        }

        modal.style.display = 'flex';
    }

    function clearMapHighlights() {
        if (!svgDoc) return;
        svgDoc.querySelectorAll('.store-shape').forEach(s => {
            s.classList.remove('highlighted');
            // Restore original category color if it's not dimmed by a filter
            if (!s.classList.contains('dimmed')) {
                const vendor = vendorData[s.id];
                if (vendor) {
                    const primaryCategory = vendor['@type'] && vendor['@type'].length > 0 ? vendor['@type'][0] : 'unknown';
                    s.style.fill = getCategoryColor(primaryCategory) || CATEGORY_COLORS.unknown;
                } else {
                    s.style.fill = CATEGORY_COLORS.unknown;
                }
            }
        });
    }

    function highlightVendorOnMap(selectedVendorId) {
        if (!svgDoc) return;

        // Dim all shapes first that are not part of current category/search filter
        const currentCategory = activeCategoryButton ? activeCategoryButton.dataset.category : 'all';
        const currentSearch = searchBar.value;
        filterMapAndList(currentCategory, currentSearch, selectedVendorId); // Pass selected ID to avoid dimming it

        // Then highlight the selected one
        const selectedShape = svgDoc.getElementById(selectedVendorId);
        if (selectedShape) {
            selectedShape.classList.remove('dimmed'); // Ensure it's not dimmed
            selectedShape.classList.add('highlighted');

            // Bring to front (SVG doesn't have z-index for elements, so re-append)
            selectedShape.parentNode.appendChild(selectedShape);
            const textLabel = svgDoc.getElementById(`text-${selectedVendorId}`);
            if(textLabel) textLabel.parentNode.appendChild(textLabel);
        }
    }

    function filterMapAndList(category, searchTerm, excludeFromDimmingId = null) {
        if (!svgDoc) return;
        const searchLower = searchTerm.toLowerCase();

        svgDoc.querySelectorAll('.store-shape').forEach(shape => {
            const vendorId = shape.id;
            const vendor = vendorData[vendorId];
            let isDimmed = false;

            // If this is the specifically selected vendor, don't dim it.
            if (vendorId === excludeFromDimmingId) {
                shape.classList.remove('dimmed');
                // Ensure it gets its category color if not highlighted
                if (!shape.classList.contains('highlighted')) {
                     const primaryCategory = vendor && vendor['@type'] && vendor['@type'].length > 0 ? vendor['@type'][0] : 'unknown';
                     shape.style.fill = getCategoryColor(primaryCategory) || CATEGORY_COLORS.unknown;
                }
                return; // Skip further dimming checks for this one
            }

            shape.classList.remove('highlighted'); // Clear old highlights not matching current selection

            if (vendor) {
                if (category && category !== 'all') {
                    const vendorCategories = vendor['@type'] ? vendor['@type'].map(c => c.toLowerCase()) : [];
                    if (!vendorCategories.includes(category)) {
                        isDimmed = true;
                    }
                }

                if (!isDimmed && searchTerm) {
                    const nameLower = vendor.name ? vendor.name.toLowerCase() : '';
                    const idLower = vendorId.toLowerCase();
                    const descLower = vendor.description ? vendor.description.toLowerCase() : '';
                    const catsLower = vendor['@type'] ? vendor['@type'].join(' ').toLowerCase() : '';

                    if (!nameLower.includes(searchLower) && !idLower.includes(searchLower) &&
                        !descLower.includes(searchLower) && !catsLower.includes(searchLower)) {
                        isDimmed = true;
                    }
                }

                if (isDimmed) {
                    shape.classList.add('dimmed');
                } else {
                    shape.classList.remove('dimmed');
                    const primaryCategory = vendor['@type'] && vendor['@type'].length > 0 ? vendor['@type'][0] : 'unknown';
                    shape.style.fill = getCategoryColor(primaryCategory) || CATEGORY_COLORS.unknown;
                }
            } else { // Shape has no vendor data
                if ((category && category !== 'all') || searchTerm) {
                     shape.classList.add('dimmed');
                } else {
                     shape.classList.remove('dimmed');
                     shape.style.fill = CATEGORY_COLORS.unknown;
                }
            }
        });
        populateVendorList(category, searchTerm); // Repopulate list based on filters
    }

    function addGlobalEventListeners() {
        modalCloseBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            clearFocusStateAndApplyGeneralFilters();
        });
        window.addEventListener('click', (event) => {
            if (modal.style.display === 'flex' && event.target === modal) {
                modal.style.display = 'none';
                clearFocusStateAndApplyGeneralFilters();
            } else if (focusedVendorId && modal.style.display !== 'flex') {
                const target = event.target;
                if (!target.closest('.vendor-item-v2') && !target.closest('.store-shape') && !(svgDoc && target.closest && target.closest('#mall-svg-element .store-map-content')) && !target.closest('.category-btn') && !target.closest('#search-bar') && !target.closest('#map-label-toggle-btn')) {
                    clearFocusStateAndApplyGeneralFilters();
                }
            }
        });

        searchBar.addEventListener('input', (e) => {
            focusedVendorId = null;
            if (selectedVendorItemInList) selectedVendorItemInList.classList.remove('selected-in-list');
            selectedVendorItemInList = null;
            if (svgDoc) svgDoc.querySelectorAll('.store-shape.highlighted').forEach(s => s.classList.remove('highlighted'));

            const searchTerm = e.target.value;
            clearSearchBtn.style.display = searchTerm ? 'inline-block' : 'none';
            const selectedCategory = activeCategoryButton ? activeCategoryButton.dataset.category : 'all';
            filterMapAndList(selectedCategory, searchTerm);
        });

        clearSearchBtn.addEventListener('click', () => {
            focusedVendorId = null;
            if (selectedVendorItemInList) selectedVendorItemInList.classList.remove('selected-in-list');
            selectedVendorItemInList = null;
            if (svgDoc) svgDoc.querySelectorAll('.store-shape.highlighted').forEach(s => s.classList.remove('highlighted'));

            searchBar.value = '';
            clearSearchBtn.style.display = 'none';
            const selectedCategory = activeCategoryButton ? activeCategoryButton.dataset.category : 'all';
            filterMapAndList(selectedCategory, '');
        });

        if (mapLabelToggleButton) {
            mapLabelToggleButton.addEventListener('click', () => {
                const newType = currentMapLabelType === 'id' ? 'logo' : 'id';
                updateMapContentDisplay(newType);
                mapLabelToggleButton.textContent = newType === 'id' ? 'Show Logos' : 'Show IDs';
            });
        }

        const allCatBtn = categoryFiltersContainer.querySelector('.category-btn[data-category="all"]');
        if (allCatBtn && !activeCategoryButton) {
            allCatBtn.classList.add('active');
            activeCategoryButton = allCatBtn;
        }
    }

    loadData();
});