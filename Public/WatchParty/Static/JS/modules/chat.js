// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import { escapeHtml } from './utils.min.js';

// ============== State ==============
const state = {
    chatMessages: null,
    usersList: null,
    currentUsername: null,
    typingUsers: {}, // { username: timeoutId }
    unreadCount: 0,
    isAtBottom: true
};

export const initChat = () => {
    state.chatMessages = document.getElementById('chat-messages');
    state.usersList = document.getElementById('users-list');

    // Initialize scroll tracking for unread badge
    trackScrollPosition();
    
    // Mobile: Klavye açılınca/kapanınca scroll pozisyonunu düzelt
    if ('visualViewport' in window) {
        window.visualViewport.addEventListener('resize', () => {
            // Kullanıcı en alttaysa, scroll pozisyonunu koru
            if (state.isAtBottom && state.chatMessages) {
                setTimeout(() => {
                    state.chatMessages.scrollTop = state.chatMessages.scrollHeight;
                }, 100);
            }
        });
    }
};

export const setCurrentUsername = (username) => {
    state.currentUsername = username;
};

export const addChatMessage = (username, avatar, message, timestamp = null, isHistoryLoad = false) => {
    if (!state.chatMessages) return;

    // Mesaj gelince typing indicator'ı kaldır
    hideTypingIndicator(username);

    // Remove welcome message if exists
    const welcomeMsg = state.chatMessages.querySelector('.wp-chat-welcome');
    if (welcomeMsg) welcomeMsg.remove();

    const time = timestamp
        ? new Date(timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        : new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    const isSelf = state.currentUsername && username === state.currentUsername;
    
    // ÖNEMLİ: Mesaj eklenmeden ÖNCE scroll pozisyonunu kontrol et
    const wasNearBottom = !isHistoryLoad && (
        state.chatMessages.scrollHeight - state.chatMessages.scrollTop - state.chatMessages.clientHeight < 100
    );

    const msgElement = document.createElement('div');
    msgElement.className = `wp-chat-message ${isSelf ? 'wp-chat-message-self' : ''}`;
    msgElement.innerHTML = `
        <div class="wp-chat-avatar">${avatar}</div>
        <div class="wp-chat-content">
            <div class="wp-chat-username">${escapeHtml(username)}</div>
            <div class="wp-chat-text">${escapeHtml(message)}</div>
            <div class="wp-chat-time">${time}</div>
        </div>
    `;

    state.chatMessages.appendChild(msgElement);
    
    // Track unread messages (only for others' messages AND not history load)
    if (!isSelf && !isHistoryLoad) incrementUnread();
    
    // Akıllı auto-scroll
    // Sadece kullanıcı zaten en alttaysa veya kendi mesajıysa scroll et
    if (!isHistoryLoad && (wasNearBottom || isSelf)) {
        state.chatMessages.scrollTo({
            top: state.chatMessages.scrollHeight,
            behavior: 'smooth'
        });
    }
};

export const addSystemMessage = (message) => {
    if (!state.chatMessages) return;
    
    // Sistem mesajı eklemeden ÖNCE scroll pozisyonunu kontrol et
    const wasNearBottom = 
        state.chatMessages.scrollHeight - state.chatMessages.scrollTop - state.chatMessages.clientHeight < 100;

    const msgElement = document.createElement('div');
    msgElement.className = 'wp-chat-system';
    msgElement.textContent = message;
    state.chatMessages.appendChild(msgElement);
    
    // Sadece kullanıcı alttaysa scroll et
    if (wasNearBottom) {
        state.chatMessages.scrollTop = state.chatMessages.scrollHeight;
    }
};

export const updateUsersList = (users) => {
    if (!state.usersList) return;

    const onlineCount = document.getElementById('online-count');

    if (!users || users.length === 0) {
        state.usersList.innerHTML = '<div class="wp-text-muted" style="padding: 0.5rem;">Henüz kimse yok</div>';
        if (onlineCount) onlineCount.textContent = '0';
        return;
    }

    // Self kullanıcıyı en başa al
    const sortedUsers = [...users].sort((a, b) => {
        const aIsSelf = state.currentUsername && a.username === state.currentUsername;
        const bIsSelf = state.currentUsername && b.username === state.currentUsername;
        if (aIsSelf) return -1;  // a en başa
        if (bIsSelf) return 1;    // b en başa
        return 0;  // Diğerleri sıralama değişmez
    });

    state.usersList.innerHTML = sortedUsers.map(user => {
        const isSelf = state.currentUsername && user.username === state.currentUsername;
        return `
            <div class="wp-user-badge ${user.is_host ? 'host' : ''} ${isSelf ? 'self' : ''}">
                <span>${user.avatar}</span>
                <span>${escapeHtml(user.username)}</span>
            </div>
        `;
    }).join('');

    if (onlineCount) onlineCount.textContent = users.length.toString();
    
    // Overlay viewer count güncelle ve geçici olarak göster
    const overlayViewerCount = document.getElementById('overlay-viewer-count');
    if (overlayViewerCount) {
        overlayViewerCount.textContent = users.length.toString();
        flashOverlay();
    }
};

// Overlay'i geçici olarak göster
const flashOverlay = () => {
    const overlay = document.getElementById('player-info-overlay');
    if (!overlay) return;
    
    overlay.classList.add('visible');
    
    // Önceki timeout'u temizle
    if (overlay._hideTimeout) clearTimeout(overlay._hideTimeout);
    
    // 3 saniye sonra gizle
    overlay._hideTimeout = setTimeout(() => {
        overlay.classList.remove('visible');
    }, 3000);
};

export const loadChatHistory = (messages) => {
    if (!state.chatMessages || !messages) return;

    // Mevcut mesajları kontrol et - sadece yeni olanları ekle
    const existingMessages = state.chatMessages.querySelectorAll('.wp-chat-message, .wp-chat-system');
    const existingCount = existingMessages.length;
    
    // Eğer mesaj sayısı aynıysa ve içerik değişmemişse hiçbir şey yapma
    if (existingCount === messages.length) return;
    
    // İlk yükleme mi yoksa yeni mesajlar mı?
    const isInitialLoad = existingCount === 0;
    
    // Sadece yeni mesajları ekle (mevcut mesaj sayısından sonrakiler)
    const newMessages = messages.slice(existingCount);
    // İLK YÜKLEMEDE isHistoryLoad=true, SONRAKI MESAJLARDA false
    newMessages.forEach(msg => addChatMessage(msg.username, msg.avatar, msg.message, msg.timestamp, isInitialLoad));
};

export const showTypingIndicator = (username) => {
    if (!state.chatMessages) return;
    
    // Önceki timeout'u temizle
    if (state.typingUsers[username]) {
        clearTimeout(state.typingUsers[username]);
    }
    
    // 3 saniye sonra bu kullanıcıyı listeden çıkar
    state.typingUsers[username] = setTimeout(() => {
        delete state.typingUsers[username];
        updateTypingIndicatorUI();
    }, 3000);
    
    // UI'ı güncelle
    updateTypingIndicatorUI();
};

const updateTypingIndicatorUI = () => {
    if (!state.chatMessages) return;
    
    const typingUsernames = Object.keys(state.typingUsers);
    let indicator = document.getElementById('typing-indicator');
    
    // Kimse yazmıyorsa indicator'ı kaldır
    if (typingUsernames.length === 0) {
        if (indicator) indicator.remove();
        return;
    }
    
    // Scroll pozisyonunu kontrol et
    const wasNearBottom = 
        state.chatMessages.scrollHeight - state.chatMessages.scrollTop - state.chatMessages.clientHeight < 100;
    
    // Indicator yoksa oluştur
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'typing-indicator';
        indicator.className = 'wp-typing-indicator';
        state.chatMessages.appendChild(indicator);
    }
    
    // Metni oluştur
    let text;
    if (typingUsernames.length === 1) {
        text = `${escapeHtml(typingUsernames[0])} yazıyor`;
    } else if (typingUsernames.length === 2) {
        text = `${escapeHtml(typingUsernames[0])} ve ${escapeHtml(typingUsernames[1])} yazıyor`;
    } else {
        const others = typingUsernames.slice(0, -1).map(u => escapeHtml(u)).join(', ');
        const last = escapeHtml(typingUsernames[typingUsernames.length - 1]);
        text = `${others} ve ${last} yazıyor`;
    }
    
    indicator.innerHTML = `
        <div class="wp-typing-dots">
            <span></span><span></span><span></span>
        </div>
        <span>${text}...</span>
    `;
    
    // Sadece kullanıcı alttaysa scroll et
    if (wasNearBottom) {
        state.chatMessages.scrollTop = state.chatMessages.scrollHeight;
    }
};

export const hideTypingIndicator = (username) => {
    if (state.typingUsers[username]) {
        clearTimeout(state.typingUsers[username]);
        delete state.typingUsers[username];
    }
    updateTypingIndicatorUI();
};

export const trackScrollPosition = () => {
    if (!state.chatMessages) return;
    
    state.chatMessages.addEventListener('scroll', () => {
        const { scrollTop, scrollHeight, clientHeight } = state.chatMessages;
        state.isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
        
        if (state.isAtBottom) {
            state.unreadCount = 0;
            updateUnreadBadge();
        }
    });
};

export const incrementUnread = () => {
    // Sadece yukarıdaysa artır
    if (!state.isAtBottom) {
        state.unreadCount++;
        updateUnreadBadge();
    }
};

const updateUnreadBadge = () => {
    const chatIcon = document.getElementById('chat-icon');
    let badge = document.getElementById('unread-badge');
    
    if (state.unreadCount > 0) {
        // Hide chat icon
        if (chatIcon) chatIcon.style.display = 'none';
        
        if (!badge) {
            const chatHeader = document.querySelector('.wp-chat-header > div:first-child');
            if (!chatHeader) return;
            
            badge = document.createElement('div');
            badge.id = 'unread-badge';
            badge.className = 'wp-unread-badge';
            // Insert as first child (icon'un yerine)
            chatHeader.insertBefore(badge, chatHeader.firstChild);
        }
        badge.textContent = state.unreadCount > 99 ? '99+' : state.unreadCount.toString();
    } else {
        // Show chat icon back
        if (chatIcon) chatIcon.style.display = '';
        if (badge) badge.remove();
    }
};
