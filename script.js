document.addEventListener('DOMContentLoaded', () => {
    let globalData = { modpacks: [], plugins: [], scripts: [] };

    // ==========================================
    // 1. EFEKTY WIZUALNE I INICJALIZACJA
    // ==========================================
    initSkillTagsAnimation();
    setupThemeToggle();
    fetchDataFromServer();

    function initSkillTagsAnimation() {
        const skillTags = document.querySelectorAll('.skill-tag');
        skillTags.forEach((tag, index) => {
            setTimeout(() => {
                tag.style.opacity = '1';
                tag.style.transform = 'translateY(0)';
            }, index * 80 + 300);
        });
    }

    function initCounters() {
        const stats = document.querySelectorAll('.stat-number');
        stats.forEach(stat => {
            const statType = stat.getAttribute('data-stat-type');
            if (statType === 'plugins' && globalData.plugins) {
                stat.setAttribute('data-target', globalData.plugins.length);
            } else if (statType === 'modpacks' && globalData.modpacks) {
                stat.setAttribute('data-target', globalData.modpacks.length);
            } else if (statType === 'scripts' && globalData.scripts) {
                stat.setAttribute('data-target', globalData.scripts.length);
            }

            const target = +stat.getAttribute('data-target') || 0;
            let count = 0;
            const updateCount = () => {
                const speed = Math.max(target / 40, 1);
                count += speed;
                if (count < target) {
                    stat.innerText = Math.ceil(count);
                    requestAnimationFrame(updateCount);
                } else {
                    stat.innerText = target;
                }
            };
            setTimeout(updateCount, 300);
        });
    }

    // ==========================================
    // 2. POBIERANIE DANYCH Z STATYCZNEGO PLIKU LUB API
    // ==========================================
    function fetchDataFromServer() {
        showLoadingState();
        
        // Zoptymalizowane pod free hosting - najpierw czytamy statyczny data.json
        fetch('data.json')
            .then(res => {
                if (!res.ok) throw new Error('Błąd ładowania lokalnego pliku');
                return res.json();
            })
            .then(data => {
                globalData = sanitizeData(data);
                onDataLoaded();
            })
            .catch(err => {
                console.warn('Nie udało się pobrać data.json bezpośrednio, próba przez API bota...', err);
                
                // Fallback do serwera Express (lokalny deweloper)
                fetch('/api/data')
                    .then(res => {
                        if (!res.ok) throw new Error('Błąd serwera API');
                        return res.json();
                    })
                    .then(data => {
                        globalData = sanitizeData(data);
                        onDataLoaded();
                    })
                    .catch(err2 => {
                        console.error('Błąd krytyczny pobierania danych:', err2);
                        renderErrorMessage();
                    });
            });
    }

    function sanitizeData(data) {
        return {
            modpacks: data.modpacks || [],
            plugins: data.plugins || [],
            scripts: data.scripts || []
        };
    }

    function onDataLoaded() {
        initPortfolio();
        initPlugins();
        initScripts();
        initCounters();
    }

    function showLoadingState() {
        const grids = ['portfolio-grid', 'plugins-grid', 'scripts-grid'];
        grids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<div class="loader"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie danych...</div>';
        });
    }

    // ==========================================
    // AUTOMATYCZNY SUPERSCRIPT ¹ DLA JEDYNEK w OPISIE
    // ==========================================
    function formatDescription(text) {
        if (!text) return '';
        // Konwertuje pojedyncze "1" na indeks górny "¹", omijając wersje jak 1.20 czy liczby typu 10
        return text.replace(/(?<![\d.])1(?![\d.])/g, '¹');
    }

    // ==========================================
    // 3. RENDEROWANIE: PORTFOLIO (PACZKI)
    // ==========================================
    function initPortfolio() {
        const grid = document.getElementById('portfolio-grid');
        const searchInput = document.getElementById('portfolio-search');
        if (!grid) return;

        const render = (items) => {
            grid.innerHTML = '';
            if (items.length === 0) {
                grid.innerHTML = '<p class="no-data-msg">Brak paczek do wyświetlenia.</p>';
                return;
            }
            items.forEach((pack, index) => {
                const card = document.createElement('div');
                card.className = 'card hover-anim fade-in-up';
                card.style.animationDelay = `${index * 0.08}s`;
                card.innerHTML = `
                    <div class="card-header">
                        <h3>📦 ${escapeHtml(pack.nazwa)}</h3>
                        <span class="badge badge-version">${escapeHtml(pack.wersja)}</span>
                    </div>
                    <p class="card-desc">${formatDescription(escapeHtml(pack.opis))}</p>
                    <div class="card-meta">
                        Dodano: ${escapeHtml(pack.dataDodania || 'Nieznana data')} (ID: ${escapeHtml(pack.id)})
                    </div>
                    <div class="card-footer-btns">
                        <button class="btn-action view-details-btn" data-type="modpack" data-id="${escapeHtml(pack.id)}">Szczegóły Paczki</button>
                    </div>
                `;
                grid.appendChild(card);
            });
            bindModalEvents();
        };

        render(globalData.modpacks);

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                render(globalData.modpacks.filter(p => 
                    p.nazwa.toLowerCase().includes(query) || 
                    p.opis.toLowerCase().includes(query)
                ));
            });
        }
    }

    // ==========================================
    // 4. RENDEROWANIE: PLUGINY
    // ==========================================
    function initPlugins() {
        const grid = document.getElementById('plugins-grid');
        const searchInput = document.getElementById('plugins-search');
        const filterBtns = document.querySelectorAll('.filter-btn');
        if (!grid) return;

        let currentFilter = 'all';

        const render = (items) => {
            grid.innerHTML = '';
            if (items.length === 0) {
                grid.innerHTML = '<p class="no-data-msg">Brak pluginów spełniających kryteria.</p>';
                return;
            }

            items.forEach((plugin, index) => {
                const isPremium = plugin.typ && plugin.typ.toLowerCase() === 'premium';
                const card = document.createElement('div');
                card.className = 'card hover-anim fade-in-up';
                card.style.animationDelay = `${index * 0.08}s`;
                card.innerHTML = `
                    <div class="card-header">
                        <h3>🔌 ${escapeHtml(plugin.nazwa)}</h3>
                        <span class="badge ${isPremium ? 'badge-premium' : 'badge-free'}">${isPremium ? 'PREMIUM' : 'FREE'}</span>
                    </div>
                    <p class="card-desc"><strong>Funkcja:</strong> ${formatDescription(escapeHtml(plugin.opis))}</p>
                    <div class="card-meta">
                        Wersja: ${escapeHtml(plugin.wersja)} | ID: ${escapeHtml(plugin.id)}
                    </div>
                    <div class="card-footer-btns">
                        <button class="btn-action view-details-btn" data-type="plugin" data-id="${escapeHtml(plugin.id)}">Dokumentacja</button>
                        ${plugin.link ? `<a href="${escapeHtml(plugin.link)}" target="_blank" class="btn-action btn-download" style="width: auto;" title="Pobierz"><i class="fa-solid fa-download"></i></a>` : ''}
                    </div>
                `;
                grid.appendChild(card);
            });
            bindModalEvents();
        };

        const applyFilters = () => {
            let filtered = globalData.plugins;
            if (currentFilter !== 'all') filtered = filtered.filter(p => p.typ === currentFilter);
            if (searchInput && searchInput.value) {
                const q = searchInput.value.toLowerCase();
                filtered = filtered.filter(p => p.nazwa.toLowerCase().includes(q) || p.opis.toLowerCase().includes(q));
            }
            render(filtered);
        };

        if (searchInput) searchInput.addEventListener('input', applyFilters);

        filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                filterBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                currentFilter = e.target.getAttribute('data-filter');
                applyFilters();
            });
        });

        applyFilters();
    }

    // ==========================================
    // RENDEROWANIE: SKRYPTY
    // ==========================================
    function initScripts() {
        const grid = document.getElementById('scripts-grid');
        const searchInput = document.getElementById('scripts-search');
        if (!grid) return;

        const render = (items) => {
            grid.innerHTML = '';
            if (items.length === 0) {
                grid.innerHTML = '<p class="no-data-msg">Brak skryptów spełniających kryteria.</p>';
                return;
            }

            items.forEach((script, index) => {
                const isPremium = script.typ && script.typ.toLowerCase() === 'premium';
                const card = document.createElement('div');
                card.className = 'card hover-anim fade-in-up';
                card.style.animationDelay = `${index * 0.08}s`;
                card.innerHTML = `
                    <div class="card-header">
                        <h3>📜 ${escapeHtml(script.nazwa)}</h3>
                        <span class="badge ${isPremium ? 'badge-premium' : 'badge-script-free'}">${isPremium ? 'PREMIUM' : 'FREE'}</span>
                    </div>
                    <p class="card-desc">${formatDescription(escapeHtml(script.opis))}</p>
                    <div class="card-meta">
                        Wymagania: ${escapeHtml(script.wersja)} | ID: ${escapeHtml(script.id)}
                    </div>
                    <div class="card-footer-btns">
                        <button class="btn-action view-details-btn" data-type="script" data-id="${escapeHtml(script.id)}">Szczegóły</button>
                        ${script.link ? `<a href="${escapeHtml(script.link)}" target="_blank" class="btn-action btn-download" style="width: auto;" title="Pobierz"><i class="fa-solid fa-download"></i></a>` : ''}
                    </div>
                `;
                grid.appendChild(card);
            });
            bindModalEvents();
        };

        render(globalData.scripts);

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                render(globalData.scripts.filter(s => 
                    s.nazwa.toLowerCase().includes(query) || 
                    s.opis.toLowerCase().includes(query)
                ));
            });
        }
    }

    // ==========================================
    // 5. DYNAMICZNA OBSŁUGA OKIEN MODALNYCH
    // ==========================================
    function bindModalEvents() {
        let modal = document.getElementById('details-modal');
        
        // Zoptymalizowane pod dynamiczne generowanie modala na wypadek jego braku w HTML
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'details-modal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <span class="close-modal">&times;</span>
                    <h3 id="modal-title"></h3>
                    <div id="modal-body"></div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');
        const closeModal = modal.querySelector('.close-modal');

        document.querySelectorAll('.view-details-btn').forEach(btn => {
            btn.onclick = () => {
                const type = btn.getAttribute('data-type');
                const id = btn.getAttribute('data-id');
                let item;

                if (type === 'plugin') {
                    item = globalData.plugins.find(p => p.id === id);
                    if (!item) return;
                    modalTitle.innerHTML = `🔌 Plugin: <span>${escapeHtml(item.nazwa)}</span>`;
                    modalBody.innerHTML = `
                        <div class="modal-section">
                            <h4>Podstawowe informacje</h4>
                            <p>Status licencji: <span class="badge ${item.typ === 'premium' ? 'badge-premium' : 'badge-free'}">${item.typ.toUpperCase()}</span></p>
                            ${item.typ === 'premium' ? `<p>Cena: <strong>${escapeHtml(item.cena)}</strong></p>` : ''}
                            <p>Kompatybilność: <strong>${escapeHtml(item.wersja)}</strong></p>
                            <p>Dodano dnia: <strong>${escapeHtml(item.dataDodania || 'Nieznana data')}</strong></p>
                        </div>
                        <div class="modal-section">
                            <h4>Uprawnienia (Permissions)</h4>
                            <pre class="code-block">${escapeHtml(item.permisje || 'Brak specyfikacji permisji')}</pre>
                        </div>
                        <div class="modal-section">
                            <h4>Opis działania</h4>
                            <p>${formatDescription(escapeHtml(item.opis))}</p>
                        </div>
                        ${item.link ? `<a href="${escapeHtml(item.link)}" target="_blank" class="btn-action btn-download" style="display:block; margin-top:20px;">Pobierz / Zobacz zasób</a>` : ''}
                    `;
                } else if (type === 'modpack') {
                    item = globalData.modpacks.find(m => m.id === id);
                    if (!item) return;
                    modalTitle.innerHTML = `📦 Paczka: <span>${escapeHtml(item.nazwa)}</span>`;
                    modalBody.innerHTML = `
                        <div class="modal-section">
                            <h4>Podstawowe informacje</h4>
                            <p>ID paczki: <strong>${escapeHtml(item.id)}</strong></p>
                            <p>Wersja gry: <span class="badge badge-version">${escapeHtml(item.wersja)}</span></p>
                            <p>Dodano dnia: <strong>${escapeHtml(item.dataDodania || 'Nieznana data')}</strong></p>
                        </div>
                        <div class="modal-section">
                            <h4>Opis projektu</h4>
                            <p style="white-space: pre-wrap; line-height:1.6;">${formatDescription(escapeHtml(item.opis))}</p>
                        </div>
                    `;
                } else if (type === 'script') {
                    item = globalData.scripts.find(s => s.id === id);
                    if (!item) return;
                    modalTitle.innerHTML = `📜 Skrypt: <span>${escapeHtml(item.nazwa)}</span>`;
                    modalBody.innerHTML = `
                        <div class="modal-section">
                            <h4>Podstawowe informacje</h4>
                            <p>Status licencji: <span class="badge ${item.typ === 'premium' ? 'badge-premium' : 'badge-script-free'}">${item.typ.toUpperCase()}</span></p>
                            ${item.typ === 'premium' ? `<p>Cena: <strong>${escapeHtml(item.cena)}</strong></p>` : ''}
                            <p>Wymagania: <strong>${escapeHtml(item.wersja)}</strong></p>
                            <p>Dodano dnia: <strong>${escapeHtml(item.dataDodania || 'Nieznana data')}</strong></p>
                        </div>
                        <div class="modal-section">
                            <h4>Opis działania</h4>
                            <p style="white-space: pre-wrap; line-height:1.6;">${formatDescription(escapeHtml(item.opis))}</p>
                        </div>
                        ${item.link ? `<a href="${escapeHtml(item.link)}" target="_blank" class="btn-action btn-download" style="display:block; margin-top:20px;">Pobierz Skrypt</a>` : ''}
                    `;
                }

                modal.classList.add('show-modal');
            };
        });

        closeModal.onclick = () => modal.classList.remove('show-modal');
        window.onclick = (e) => { if (e.target === modal) modal.classList.remove('show-modal'); };
    }

    // ==========================================
    // 6. MOTYW JASNY / CIEMNY (THEME TOGGLE)
    // ==========================================
    function setupThemeToggle() {
        const toggleBtn = document.getElementById('theme-toggle');
        if (!toggleBtn) return;

        // Domyślny motyw
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateToggleIcon(toggleBtn, savedTheme);

        toggleBtn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateToggleIcon(toggleBtn, newTheme);
        });
    }

    function updateToggleIcon(btn, theme) {
        if (theme === 'light') {
            btn.innerHTML = '<i class="fa-solid fa-moon"></i>';
            btn.title = 'Przełącz na motyw ciemny';
        } else {
            btn.innerHTML = '<i class="fa-solid fa-sun"></i>';
            btn.title = 'Przełącz na motyw jasny';
        }
    }

    // ==========================================
    // 7. OBSŁUGA BŁĘDU
    // ==========================================
    function renderErrorMessage() {
        const grids = ['portfolio-grid', 'plugins-grid', 'scripts-grid'];
        grids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<p class="no-data-msg" style="color:#ff4a4a;"><i class="fa-solid fa-triangle-exclamation"></i> Nie udało się załadować danych. Serwer bota może być wyłączony.</p>';
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
});