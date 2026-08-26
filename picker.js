if (!window.priceTrackerPickerInjected) {
    window.priceTrackerPickerInjected = true;

    let pickerActive = false;
    let hoveredElement = null;
    let overlay = null;
    let panelRoot = null;
    let shadow = null;
    let isPaused = false;

    const trans = {
        en: {
            title: "Select Element",
            space: "Press SPACE to pause (Esc to exit)",
            paused: "PAUSED (Press SPACE to continue)",
            selector: "🎯 Selector:",
            hoverPrompt: "Hover mouse over element..."
        },
        bg: {
            title: "Избор на елемент",
            space: "Натисни SPACE за пауза (Esc за изход)",
            paused: "ПАУЗИРАНО (Натисни SPACE за продължаване)",
            selector: "🎯 Селектор:",
            hoverPrompt: "Наведи мишката над елемент..."
        }
    };
    let lang = 'en';
    let animFrameId = null;
    function t(k) { return trans[lang][k] || k; }

    function initPicker() {
        if (pickerActive) return;
        pickerActive = true;
        isPaused = false;

        // Create highlight overlay
        overlay = document.createElement('div');
        overlay.id = 'price-tracker-overlay';
        document.body.appendChild(overlay);

        // Create Shadow DOM panel
        panelRoot = document.createElement('div');
        panelRoot.id = 'price-tracker-panel-root';
        document.body.appendChild(panelRoot);
        
        shadow = panelRoot.attachShadow({ mode: 'open' });

        chrome.storage.local.get(['settings', 'themePreference'], (d) => {
            if (d.settings && d.settings.language) lang = d.settings.language;
            const theme = d.themePreference || 'auto';
            if (theme === 'dark') panelRoot.classList.add('theme-dark');
            else if (theme === 'light') panelRoot.classList.add('theme-light');
            
            if (shadow) {
                const headerSpan = shadow.querySelector('.header span:first-child');
                if (headerSpan) headerSpan.innerText = trans[lang].title;
                const statusSpan = shadow.getElementById('status-text');
                if (statusSpan && !isPaused) statusSpan.innerText = trans[lang].space;
                const treeView = shadow.getElementById('tree-view');
                if (treeView && !hoveredElement) treeView.innerText = trans[lang].hoverPrompt;
            }
        });
        
        const style = document.createElement('style');
        style.textContent = `
            #picker-panel {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 550px;
                background: #fff;
                border: 2px solid #007bff;
                border-radius: 8px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.3);
                font-family: monospace;
                z-index: 2147483647;
                display: flex;
                flex-direction: column;
                color: #333;
                overflow: hidden;
                font-size: 13px;
            }
            .header {
                background: #007bff;
                color: white;
                padding: 10px;
                font-weight: bold;
                font-family: sans-serif;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .header button {
                background: none;
                border: none;
                color: white;
                cursor: pointer;
                font-size: 16px;
            }
            .tree-view {
                padding: 10px;
                max-height: 450px;
                overflow-y: auto;
                background: #f8f9fa;
            }
            .node {
                padding: 4px;
                cursor: pointer;
                border-radius: 3px;
                margin: 2px 0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .node:hover {
                background: #e9ecef;
                outline: 1px solid #007bff;
            }
            .node.active {
                background: #cce5ff;
                font-weight: bold;
                border-left: 3px solid #007bff;
            }
            .tag { color: #d63384; }
            .attr { color: #0dcaf0; }
            .val { color: #198754; }
            .text { color: #212529; font-family: sans-serif; font-size: 12px; margin-left: 15px; }
            #status-text { font-size: 12px; font-weight: normal; margin-top: 4px; color: #e9ecef; }
            
            @media (prefers-color-scheme: dark) {
                :host(:not(.theme-light)) #picker-panel { background: #1e1f20; border-color: #a8c7fa; color: #e3e3e3; box-shadow: 0 10px 25px rgba(0,0,0,0.8); }
                :host(:not(.theme-light)) .header { background: #282a2c; color: #e3e3e3; border-bottom: 1px solid #444746; }
                :host(:not(.theme-light)) .tree-view { background: #131314; }
                :host(:not(.theme-light)) .node:hover { background: #282a2c; outline-color: #a8c7fa; }
                :host(:not(.theme-light)) .node.active { background: #004a77; border-left-color: #a8c7fa; }
                :host(:not(.theme-light)) .tag { color: #f28b82; }
                :host(:not(.theme-light)) .attr { color: #8ab4f8; }
                :host(:not(.theme-light)) .val { color: #81c995; }
                :host(:not(.theme-light)) .text { color: #c4c7c5; }
                :host(:not(.theme-light)) #status-text { color: #c4c7c5; }
            }
            :host(.theme-dark) #picker-panel { background: #1e1f20; border-color: #a8c7fa; color: #e3e3e3; box-shadow: 0 10px 25px rgba(0,0,0,0.8); }
            :host(.theme-dark) .header { background: #282a2c; color: #e3e3e3; border-bottom: 1px solid #444746; }
            :host(.theme-dark) .tree-view { background: #131314; }
            :host(.theme-dark) .node:hover { background: #282a2c; outline-color: #a8c7fa; }
            :host(.theme-dark) .node.active { background: #004a77; border-left-color: #a8c7fa; }
            :host(.theme-dark) .tag { color: #f28b82; }
            :host(.theme-dark) .attr { color: #8ab4f8; }
            :host(.theme-dark) .val { color: #81c995; }
            :host(.theme-dark) .text { color: #c4c7c5; }
            :host(.theme-dark) #status-text { color: #c4c7c5; }
        `;
        
        const panel = document.createElement('div');
        panel.id = 'picker-panel';
        panel.innerHTML = `
            <div class="header">
                <div style="display:flex; flex-direction:column;">
                    <span>${t("title")}</span>
                    <span id="status-text">${t("space")}</span>
                </div>
                <button id="close-picker">✖</button>
            </div>
            <div class="tree-view" id="tree-view">${t("hoverPrompt")}</div>
        `;
        
        shadow.appendChild(style);
        shadow.appendChild(panel);

        shadow.getElementById('close-picker').addEventListener('click', stopPicker);

        document.addEventListener('mousemove', handleMouseMove, true);
        document.addEventListener('click', handleClick, true);
        document.addEventListener('keydown', handleKeyDown, true);
    }

    function stopPicker() {
        pickerActive = false;
        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }
        document.removeEventListener('mousemove', handleMouseMove, true);
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('keydown', handleKeyDown, true);
        if (overlay) overlay.remove();
        if (panelRoot) panelRoot.remove();
    }

    function handleKeyDown(e) {
        if (e.code === 'Space') {
            e.preventDefault();
            e.stopPropagation();
            isPaused = !isPaused;
            const statusEl = shadow.getElementById('status-text');
            if (isPaused) {
                statusEl.innerText = t("paused");
                statusEl.style.color = "#ffc107";
                statusEl.style.fontWeight = "bold";
            } else {
                statusEl.innerText = t("space");
                statusEl.style.color = "#e9ecef";
                statusEl.style.fontWeight = "normal";
            }
        } else if (e.code === 'Escape') {
            stopPicker();
        }
    }

    function getCssSelector(el) {
        if (!(el instanceof Element)) return;
        let path = [];
        while (el.nodeType === Node.ELEMENT_NODE) {
            let selector = el.nodeName.toLowerCase();
            if (el.id) {
                selector += '#' + el.id;
                path.unshift(selector);
                break;
            } else {
                let sib = el, nth = 1;
                while (sib = sib.previousElementSibling) {
                    if (sib.nodeName.toLowerCase() == selector) nth++;
                }
                if (nth != 1) selector += ":nth-of-type("+nth+")";
            }
            path.unshift(selector);
            el = el.parentNode;
        }
        return path.join(" > ");
    }

    function formatNode(node, isActive) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return '';
        let attrs = Array.from(node.attributes).map(a => `<span class="attr">${a.name}</span>="<span class="val">${a.value}</span>"`).join(' ');
        let tag = node.tagName.toLowerCase();
        
        let text = Array.from(node.childNodes)
            .filter(c => c.nodeType === Node.TEXT_NODE && c.textContent.trim())
            .map(c => c.textContent.trim())
            .join(' ');
            
        let textHtml = text ? `<div class="text">${text.substring(0, 80)}${text.length > 80 ? '...' : ''}</div>` : '';
        
        let selectorInfo = '';
        if (isActive) {
            selectorInfo = `<div style="font-size:11px; color:#ffc107; margin-top:4px; font-weight:bold; letter-spacing:0.5px;">${t("selector")} ${getCssSelector(node)}</div>`;
        }

        return `<div class="node ${isActive ? 'active' : ''}">
            &lt;<span class="tag">${tag}</span> ${attrs}&gt;
            ${textHtml}
            ${selectorInfo}
        </div>`;
    }

    function updatePanel(target) {
        const treeView = shadow.getElementById('tree-view');
        treeView.innerHTML = '';
        
        let nodesToRender = [];
        let current = target;
        let ancestors = [];
        
        // 3 hierarchies up
        for (let i = 0; i < 3; i++) {
            if (current.parentElement) {
                ancestors.unshift(current.parentElement);
                current = current.parentElement;
            } else {
                break;
            }
        }
        
        let baseIndent = 0;
        ancestors.forEach(a => {
            nodesToRender.push({ el: a, indent: baseIndent, isActive: false });
            baseIndent += 15;
        });
        
        // Target
        nodesToRender.push({ el: target, indent: baseIndent, isActive: true });
        
        // 2 hierarchies down
        let childIndent = baseIndent + 15;
        Array.from(target.children).slice(0, 15).forEach(child => {
            nodesToRender.push({ el: child, indent: childIndent, isActive: false });
            
            let gcIndent = childIndent + 15;
            Array.from(child.children).slice(0, 10).forEach(gc => {
                nodesToRender.push({ el: gc, indent: gcIndent, isActive: false });
            });
        });
        
        nodesToRender.forEach(nodeInfo => {
            let div = document.createElement('div');
            div.innerHTML = formatNode(nodeInfo.el, nodeInfo.isActive);
            div.addEventListener('mouseenter', () => highlightElement(nodeInfo.el));
            div.addEventListener('mouseleave', () => highlightElement(isPaused ? target : hoveredElement));
            div.addEventListener('click', (e) => { e.stopPropagation(); selectElement(nodeInfo.el); });
            div.style.marginLeft = nodeInfo.indent + 'px';
            treeView.appendChild(div);
        });
    }

    function highlightElement(el) {
        if (!el || !overlay) return;
        const rect = el.getBoundingClientRect();
        overlay.style.top = (rect.top + window.scrollY) + 'px';
        overlay.style.left = (rect.left + window.scrollX) + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
        overlay.style.display = 'block';
    }

    function handleMouseMove(e) {
        if (e.composedPath().includes(panelRoot)) return;
        if (isPaused) return;

        const clientX = e.clientX;
        const clientY = e.clientY;
        const target = e.target;

        if (animFrameId) cancelAnimationFrame(animFrameId);

        animFrameId = requestAnimationFrame(() => {
            animFrameId = null;
            let targetEl = target;

            if (targetEl === overlay) {
                overlay.style.display = 'none';
                targetEl = document.elementFromPoint(clientX, clientY);
                overlay.style.display = 'block';
            }

            if (targetEl && targetEl !== hoveredElement && !panelRoot.contains(targetEl)) {
                hoveredElement = targetEl;
                highlightElement(hoveredElement);
                updatePanel(hoveredElement);
            }
        });
    }

    function handleClick(e) {
        if (e.composedPath().includes(panelRoot)) {
            return; 
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        if (hoveredElement) {
            selectElement(hoveredElement);
        }
    }

    function selectElement(el) {
        const selector = getCssSelector(el);
        try {
            chrome.runtime.sendMessage({ action: "picker_result", selector: selector, url: window.location.href }, () => {
                if (chrome.runtime.lastError) {
                    console.warn("PriceTracker Picker:", chrome.runtime.lastError.message);
                }
                stopPicker();
            });
        } catch (e) {
            console.warn("PriceTracker Picker: Extension context invalidated. Please refresh the page (F5).", e);
            stopPicker();
        }
    }

    window.startPriceTrackerPicker = initPicker;
    window.startPriceTrackerPicker();
} else {
    if (window.startPriceTrackerPicker) {
        window.startPriceTrackerPicker();
    }
}
