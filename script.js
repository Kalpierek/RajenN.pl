// Konfiguracja backendu
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000' 
    : ''; 

// ==========================================
// ZMIENNE GLOBALNE
// ==========================================
let allProjects = [];
let currentSort = 'newest';
let currentFilter = 'all'; // Dla filtrów darmowych/premium na stronie pluginów

// ==========================================
// SYSTEM POWIADOMIEŃ (TOAST)
// ==========================================
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const colors = {
        success: '#2ecc71',
        error: '#e74c3c',
        info: '#3498db'
    };
    
    toast.style.cssText = `
        background: var(--card-bg);
        border-left: 4px solid ${colors[type]};
        color: var(--text-color);
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        font-weight: 600;
        font-size: 14px;
        backdrop-filter: blur(10px);
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    `;
    toast.innerHTML = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    }, 10);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ==========================================
// INICJALIZACJA STRONY
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initPortfolio();
    initAdminPanel();
});

// Motywy
function initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            themeToggle.innerHTML = newTheme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
            showToast('Zmieniono motyw graficzny', 'info');
        });
    }
}

// ==========================================
// FUNKCJE PORTFOLIO / STRONY GŁÓWNEJ / PODSTRON
// ==========================================
function initPortfolio() {
    // Jeśli jesteśmy na stronie głównej (posiada statystyki)
    if (document.getElementById('api-stat-tickets')) {
        fetchStats();
    }

    // Załadujmy dane, jeśli jesteśmy na którejkolwiek stronie z katalogiem
    const hasPortfolioGrid = !!document.getElementById('portfolio-grid');
    const hasPluginsGrid = !!document.getElementById('plugins-grid');
    const hasScriptsGrid = !!document.getElementById('scripts-grid');

    if (hasPortfolioGrid || hasPluginsGrid || hasScriptsGrid) {
        loadPortfolio();
    }
}

async function fetchStats() {
    try {
        const res = await fetch(`${API_URL}/api/stats`);
        if (res.ok) {
            const data = await res.json();
            // Animacja licznika
            animateValue('api-stat-tickets', 0, data.tickets || 0, 1000);
            animateValue('api-stat-plugins', 0, data.plugins || 0, 1000);
            animateValue('api-stat-scripts', 0, data.scripts || 0, 1000);
        }
    } catch (e) {
        console.warn("Nie udało się pobrać statystyk:", e);
    }
}

function animateValue(id, start, end, duration) {
    if (start === end) return;
    const obj = document.getElementById(id);
    if(!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

async function loadPortfolio() {
    try {
        const res = await fetch('data.json');
        if (!res.ok) throw new Error("Brak pliku data.json");
        const data = await res.json();
        
        allProjects = [
            ...(data.plugins || []).map(p => ({ ...p, category: 'plugins', icon: 'fa-plug', color: '#2ecc71', timestamp: Date.now() - Math.random()*100000 })),
            ...(data.scripts || []).map(s => ({ ...s, category: 'scripts', icon: 'fa-scroll', color: '#f1c40f', timestamp: Date.now() - Math.random()*100000 })),
            ...(data.modpacks || []).map(m => ({ ...m, category: 'modpacks', icon: 'fa-cube', color: '#e74c3c', timestamp: Date.now() - Math.random()*100000 }))
        ];
        
        setupPageListeners();
        filterAndSortProjects();
    } catch (e) {
        console.error("Błąd portfolio:", e);
        ['portfolio-grid', 'plugins-grid', 'scripts-grid'].forEach(gridId => {
            const grid = document.getElementById(gridId);
            if (grid) grid.innerHTML = '<p class="error-msg">Nie udało się załadować bazy projektów.</p>';
        });
    }
}

function setupPageListeners() {
    // Strona Portfolio (Moje Paczki)
    const portfolioSearch = document.getElementById('portfolio-search');
    if (portfolioSearch) {
        portfolioSearch.addEventListener('input', () => filterAndSortProjects());
    }

    // Strona Pluginów
    const pluginsSearch = document.getElementById('plugins-search');
    if (pluginsSearch) {
        pluginsSearch.addEventListener('input', () => filterAndSortProjects());
    }
    const filterButtons = document.querySelectorAll('.filter-btn');
    if (filterButtons.length > 0) {
        filterButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                filterButtons.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                currentFilter = e.currentTarget.getAttribute('data-filter');
                filterAndSortProjects();
            });
        });
    }

    // Strona Skryptów
    const scriptsSearch = document.getElementById('scripts-search');
    if (scriptsSearch) {
        scriptsSearch.addEventListener('input', () => filterAndSortProjects());
    }
}

function filterAndSortProjects() {
    const portfolioGrid = document.getElementById('portfolio-grid');
    const pluginsGrid = document.getElementById('plugins-grid');
    const scriptsGrid = document.getElementById('scripts-grid');

    // 1. Jeśli jesteśmy na stronie Portfolio (Paczki)
    if (portfolioGrid) {
        const searchInput = document.getElementById('portfolio-search');
        const searchVal = searchInput ? searchInput.value.toLowerCase() : '';
        const filtered = allProjects.filter(proj => 
            proj.category === 'modpacks' && 
            (proj.nazwa.toLowerCase().includes(searchVal) || (proj.opis && proj.opis.toLowerCase().includes(searchVal)))
        );
        renderProjects(filtered, portfolioGrid);
    }

    // 2. Jeśli jesteśmy na stronie Pluginów
    if (pluginsGrid) {
        const searchInput = document.getElementById('plugins-search');
        const searchVal = searchInput ? searchInput.value.toLowerCase() : '';
        const filtered = allProjects.filter(proj => {
            if (proj.category !== 'plugins') return false;
            const matchesSearch = proj.nazwa.toLowerCase().includes(searchVal) || (proj.opis && proj.opis.toLowerCase().includes(searchVal));
            const matchesFilter = currentFilter === 'all' || proj.typ === currentFilter;
            return matchesSearch && matchesFilter;
        });
        renderProjects(filtered, pluginsGrid);
    }

    // 3. Jeśli jesteśmy na stronie Skryptów
    if (scriptsGrid) {
        const searchInput = document.getElementById('scripts-search');
        const searchVal = searchInput ? searchInput.value.toLowerCase() : '';
        const filtered = allProjects.filter(proj => 
            proj.category === 'scripts' && 
            (proj.nazwa.toLowerCase().includes(searchVal) || (proj.opis && proj.opis.toLowerCase().includes(searchVal)))
        );
        renderProjects(filtered, scriptsGrid);
    }
}

function renderProjects(projects, gridElement) {
    if (projects.length === 0) {
        gridElement.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-inactive);">Brak projektów spełniających kryteria.</div>';
        return;
    }

    gridElement.innerHTML = projects.map((proj, index) => {
        const isFree = proj.typ === 'free';
        let actionButtons = '';
        if (proj.youtube) {
            actionButtons += `<a href="${proj.youtube}" target="_blank" class="btn-action" style="width: auto; padding: 6px 12px; border-radius: 8px; background: rgba(231, 76, 60, 0.15); color: #e74c3c; border-color: rgba(231, 76, 60, 0.3); margin-right: 8px; display: inline-flex; align-items: center; gap: 6px;"><i class="fa-brands fa-youtube"></i> Video</a>`;
        }
        if (proj.link) {
            actionButtons += `<a href="${proj.link}" target="_blank" class="btn-action" style="width: auto; padding: 6px 16px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px;"><i class="fa-solid fa-download"></i> Pobierz</a>`;
        } else {
            actionButtons += `<span style="font-size: 12px; color: var(--text-inactive);">Brak linku</span>`;
        }

        return `
        <div class="card hover-anim fade-in-up" style="animation-delay: ${index * 0.05}s; border-top: 3px solid ${proj.color};">
            <div class="card-header">
                <div>
                    <span class="badge" style="background: rgba(255,255,255,0.05); color: ${proj.color}; margin-bottom: 8px;">
                        <i class="fa-solid ${proj.icon}"></i> ${proj.category.toUpperCase()}
                    </span>
                    <h3>${proj.nazwa}</h3>
                </div>
                <span class="badge badge-version">v${proj.wersja || '1.0'}</span>
            </div>
            <p class="card-desc">${proj.opis || 'Brak opisu dla tego projektu.'}</p>
            <div class="card-meta" style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;">
                <strong style="color: ${isFree ? '#2ecc71' : '#f1c40f'};">
                    ${isFree ? 'Darmowy' : (proj.cena || 'Premium')}
                </strong>
                <div style="display: flex; align-items: center;">
                    ${actionButtons}
                </div>
            </div>
        </div>
        `;
    }).join('');
}

// ==========================================
// PANEL ADMINISTRATORA (TICKETY & OAUTH2)
// ==========================================
function initAdminPanel() {
    const loginContainer = document.getElementById('login-container');
    const dashboardContainer = document.getElementById('dashboard-container');
    if (!loginContainer || !dashboardContainer) return; // Nie jesteśmy na stronie Ticket.html

    const adminPwdInput = document.getElementById('admin-pwd');
    const loginBtn = document.getElementById('login-btn');
    const loginError = document.getElementById('login-error');
    const discordLoginBtn = document.getElementById('discord-login-btn');
    const discordWarning = document.getElementById('discord-warning');
    const logoutBtn = document.getElementById('logout-btn');

    // Ustawienie poprawnego adresu przekierowania dla logowania przez Discord
    if (discordLoginBtn) {
        discordLoginBtn.href = `${API_URL}/api/auth/discord`;
    }
    
    const ticketsList = document.getElementById('tickets-list');
    const chatWindow = document.getElementById('chat-window');
    const chatTitle = document.getElementById('chat-title');
    const chatMessages = document.getElementById('chat-messages');
    const chatMsgInput = document.getElementById('chat-msg-input');
    const sendMsgBtn = document.getElementById('send-msg-btn');
    const closeTicketBtn = document.getElementById('close-ticket-btn');

    const userProfileCard = document.getElementById('user-profile-card');
    const userAvatar = document.getElementById('user-avatar');
    const userAvatarPlaceholder = document.getElementById('user-avatar-placeholder');
    const userName = document.getElementById('user-name');
    const userRole = document.getElementById('user-role');

    let activeTicketId = null;
    let listPollInterval = null;
    let chatPollInterval = null;

    // Helper: Pobieranie nagłówków autoryzacji
    function getAuthHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const pwd = localStorage.getItem('admin_pwd');
        if (pwd) {
            headers['Authorization'] = pwd;
        }
        return headers;
    }

    // Helper: Wyświetlanie profilu użytkownika
    function renderUserProfile(user) {
        if (user.avatar) {
            userAvatar.src = user.avatar;
            userAvatar.style.display = 'block';
            userAvatarPlaceholder.style.display = 'none';
        } else {
            userAvatar.style.display = 'none';
            userAvatarPlaceholder.style.display = 'flex';
            userAvatarPlaceholder.innerText = user.username.charAt(0).toUpperCase();
        }
        userName.innerText = user.globalName || user.username;
        userRole.innerText = user.role === 'owner' ? 'Właściciel' : 'Opiekun';
    }

    // Funkcja wylogowania
    async function logout() {
        try {
            await fetch(`${API_URL}/api/auth/logout`, { method: 'POST' });
        } catch (e) {}
        localStorage.removeItem('admin_pwd');
        showLogin();
        showToast('Pomyślnie wylogowano panel', 'info');
    }

    // Przełączanie widoków
    function showDashboard(user) {
        loginContainer.style.display = 'none';
        dashboardContainer.style.display = 'block';
        renderUserProfile(user);
        
        loadTicketsList();
        
        // Polling listy ticketów co 5 sekund
        clearInterval(listPollInterval);
        listPollInterval = setInterval(loadTicketsList, 5000);
    }

    function showLogin() {
        loginContainer.style.display = 'flex';
        dashboardContainer.style.display = 'none';
        chatWindow.style.display = 'none';
        activeTicketId = null;
        
        clearInterval(listPollInterval);
        clearInterval(chatPollInterval);
    }

    // Sprawdzanie stanu autoryzacji przy wejściu na stronę
    async function checkLoginStatus() {
        try {
            // Najpierw sprawdzamy aktywną sesję (Discord OAuth2 lub sesja hasła)
            const res = await fetch(`${API_URL}/api/auth/me`);
            if (res.ok) {
                const data = await res.json();
                if (data.loggedIn) {
                    showDashboard(data.user || { username: 'Zalogowany', role: data.role });
                    return;
                }
            }

            // Jeśli sesja nie istnieje, sprawdzamy czy w localStorage jest zapisane hasło
            const savedPwd = localStorage.getItem('admin_pwd');
            if (savedPwd) {
                const testRes = await fetch(`${API_URL}/api/tickets`, {
                    headers: { 'Authorization': savedPwd }
                });
                if (testRes.ok) {
                    const role = savedPwd.includes('Opiekun') ? 'opiekun' : 'owner';
                    showDashboard({ username: role === 'owner' ? 'Właściciel' : 'Opiekun', role: role });
                    return;
                } else {
                    localStorage.removeItem('admin_pwd');
                }
            }
            
            showLogin();
        } catch (e) {
            console.error("Błąd sprawdzania statusu logowania:", e);
            showLogin();
        }
    }

    // Sprawdzanie dostępności Discord OAuth2
    async function checkAuthConfig() {
        try {
            const res = await fetch(`${API_URL}/api/auth/config`);
            if (res.ok) {
                const data = await res.json();
                if (!data.discordEnabled) {
                    discordLoginBtn.style.display = 'none';
                    discordWarning.style.display = 'block';
                } else {
                    discordLoginBtn.style.display = 'flex';
                    discordWarning.style.display = 'none';
                }
            }
        } catch (e) {
            console.warn("Błąd pobierania konfiguracji auth:", e);
        }
    }

    // Pobieranie i renderowanie ticketów
    async function loadTicketsList() {
        try {
            const res = await fetch(`${API_URL}/api/tickets`, { headers: getAuthHeaders() });
            if (!res.ok) {
                if (res.status === 401) {
                    logout();
                }
                return;
            }
            const tickets = await res.json();
            
            if (tickets.length === 0) {
                ticketsList.innerHTML = '<p style="color: var(--text-inactive); text-align: center; padding: 20px;">Brak aktywnych zgłoszeń.</p>';
                return;
            }

            ticketsList.innerHTML = tickets.map(t => {
                const isActive = t.id === activeTicketId;
                return `
                    <div class="ticket-item" data-id="${t.id}" style="padding: 14px 16px; background: ${isActive ? 'rgba(52, 152, 219, 0.15)' : 'rgba(255,255,255,0.03)'}; border: 1px solid ${isActive ? '#3498db' : 'rgba(255,255,255,0.08)'}; border-radius: 8px; cursor: pointer; transition: all 0.2s; font-weight: 600; display: flex; align-items: center; gap: 10px;">
                        <i class="fa-solid fa-hashtag" style="color: ${isActive ? '#3498db' : 'var(--text-muted)'};"></i>
                        <span style="color: ${isActive ? 'var(--text-color)' : 'var(--text-muted)'}; flex: 1;">${t.name}</span>
                        <i class="fa-solid fa-chevron-right" style="font-size: 12px; opacity: 0.5;"></i>
                    </div>
                `;
            }).join('');

            // Dodanie event listenerów
            document.querySelectorAll('.ticket-item').forEach(item => {
                item.addEventListener('click', () => {
                    const ticketId = item.getAttribute('data-id');
                    selectTicket(ticketId, item.querySelector('span').innerText);
                });
            });

        } catch (e) {
            console.error("Błąd pobierania ticketów:", e);
        }
    }

    // Wybór ticketu
    function selectTicket(ticketId, ticketName) {
        activeTicketId = ticketId;
        chatWindow.style.display = 'block';
        chatTitle.innerHTML = `<i class="fa-solid fa-hashtag" style="color: #3498db;"></i> ${ticketName}`;
        chatMessages.innerHTML = '<p style="color: var(--text-inactive); text-align: center; margin-top: 40px;">Ładowanie wiadomości...</p>';
        
        loadChatMessages();
        
        // Ponowne renderowanie listy, by podświetlić aktywny
        document.querySelectorAll('.ticket-item').forEach(item => {
            const isCurrent = item.getAttribute('data-id') === ticketId;
            item.style.background = isCurrent ? 'rgba(52, 152, 219, 0.15)' : 'rgba(255,255,255,0.03)';
            item.style.borderColor = isCurrent ? '#3498db' : 'rgba(255,255,255,0.08)';
            item.querySelector('i').style.color = isCurrent ? '#3498db' : 'var(--text-muted)';
            item.querySelector('span').style.color = isCurrent ? 'var(--text-color)' : 'var(--text-muted)';
        });

        // Polling czatu co 4 sekundy
        clearInterval(chatPollInterval);
        chatPollInterval = setInterval(loadChatMessages, 4000);
    }

    // Pobieranie wiadomości czatu
    async function loadChatMessages() {
        if (!activeTicketId) return;
        try {
            const res = await fetch(`${API_URL}/api/tickets/${activeTicketId}`, { headers: getAuthHeaders() });
            if (!res.ok) return;
            const data = await res.json();
            
            if (!data.messages || data.messages.length === 0) {
                chatMessages.innerHTML = '<p style="color: var(--text-inactive); text-align: center; margin-top: 40px;">Brak wiadomości w tym kanale.</p>';
                return;
            }

            const shouldScroll = chatMessages.scrollTop + chatMessages.clientHeight >= chatMessages.scrollHeight - 50;

            chatMessages.innerHTML = data.messages.map(m => {
                // Jeśli autorem jest bot, to wiadomość Administracji (lub bota), w przeciwnym wypadku Klienta.
                const isAdmin = m.isBot;
                
                return `
                    <div style="display: flex; flex-direction: column; align-self: ${isAdmin ? 'flex-end' : 'flex-start'}; max-width: 80%; width: max-content; min-width: 120px;">
                        <span style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px; align-self: ${isAdmin ? 'flex-end' : 'flex-start'}; font-weight: 600;">
                            ${m.author} ${isAdmin ? '🛠️' : '👤'}
                        </span>
                        <div style="padding: 12px 16px; border-radius: 12px; background: ${isAdmin ? 'rgba(52, 152, 219, 0.2)' : 'rgba(255,255,255,0.05)'}; color: var(--text-color); font-size: 14px; line-height: 1.45; word-break: break-word; border: 1px solid ${isAdmin ? 'rgba(52, 152, 219, 0.3)' : 'rgba(255,255,255,0.08)'}; border-bottom-right-radius: ${isAdmin ? '2px' : '12px'}; border-bottom-left-radius: ${isAdmin ? '12px' : '2px'}; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
                            ${escapeHtml(m.content)}
                        </div>
                        <span style="font-size: 9px; color: var(--text-inactive); margin-top: 4px; align-self: ${isAdmin ? 'flex-end' : 'flex-start'};">
                            ${new Date(m.timestamp).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                `;
            }).join('');

            if (shouldScroll) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        } catch (e) {
            console.error("Błąd pobierania wiadomości chatu:", e);
        }
    }

    // Wysyłanie wiadomości
    async function sendMessage() {
        const msgText = chatMsgInput.value.trim();
        if (!msgText || !activeTicketId) return;

        chatMsgInput.value = '';
        sendMsgBtn.disabled = true;

        try {
            const res = await fetch(`${API_URL}/api/tickets/${activeTicketId}/send`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ message: msgText })
            });

            if (res.ok) {
                await loadChatMessages();
                chatMessages.scrollTop = chatMessages.scrollHeight;
            } else {
                showToast('Błąd wysyłania wiadomości', 'error');
            }
        } catch (e) {
            console.error("Błąd wysyłania:", e);
            showToast('Błąd połączenia z serwerem', 'error');
        } finally {
            sendMsgBtn.disabled = false;
            chatMsgInput.focus();
        }
    }

    // Zamykanie ticketu
    async function closeTicket() {
        if (!activeTicketId) return;
        if (!confirm('Czy na pewno chcesz zamknąć to zgłoszenie i usunąć kanał?')) return;

        try {
            const res = await fetch(`${API_URL}/api/tickets/${activeTicketId}/close`, {
                method: 'POST',
                headers: getAuthHeaders()
            });

            if (res.ok) {
                showToast('Zgłoszenie zostało pomyślnie zamknięte', 'success');
                chatWindow.style.display = 'none';
                activeTicketId = null;
                clearInterval(chatPollInterval);
                loadTicketsList();
            } else {
                showToast('Nie udało się zamknąć ticketu', 'error');
            }
        } catch (e) {
            console.error("Błąd zamykania ticketu:", e);
            showToast('Błąd połączenia z serwerem', 'error');
        }
    }

    // Pomocnicza do zabezpieczania tekstu
    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Event Listenery dla logowania
    loginBtn.addEventListener('click', async () => {
        const pwd = adminPwdInput.value;
        if (!pwd) return;

        loginBtn.disabled = true;
        try {
            const res = await fetch(`${API_URL}/api/auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pwd })
            });

            if (res.ok) {
                const data = await res.json();
                localStorage.setItem('admin_pwd', pwd);
                showDashboard({ username: data.role === 'owner' ? 'Właściciel' : 'Opiekun', role: data.role });
                showToast('Zalogowano pomyślnie', 'success');
                loginError.style.display = 'none';
                adminPwdInput.value = '';
            } else {
                loginError.style.display = 'block';
                showToast('Błędne hasło logowania', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('Błąd podczas logowania', 'error');
        } finally {
            loginBtn.disabled = false;
        }
    });

    adminPwdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loginBtn.click();
    });

    // Inne eventy
    logoutBtn.addEventListener('click', logout);
    
    sendMsgBtn.addEventListener('click', sendMessage);
    chatMsgInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    closeTicketBtn.addEventListener('click', closeTicket);

    // Wywołania startowe
    checkAuthConfig();
    checkLoginStatus();
}