// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import { escapeHtml } from './utils.min.js';

// ============== State ==============
const state = {
    chatMessages: null,
    usersList: null,
    currentUsername: null,
    typingUsers: {}, // { username: timeoutId }
    unreadCount: 0,
    isAtBottom: true,
    replyingTo: null, // { username, message, avatar }
    roomUsers: [], // [{ username, avatar, user_id, is_host }]
    mentionDropdownOpen: false,
    mentionQuery: '',
    mentionStartIndex: -1,
    selectedMentionIndex: 0
};

// Notification callback (main.js'ten set edilecek)
let notificationCallback = null;
export const setNotificationCallback = (callback) => {
    notificationCallback = callback;
};

export const initChat = () => {
    state.chatMessages = document.getElementById('chat-messages');
    state.usersList = document.getElementById('users-list');

    // Initialize scroll tracking for unread badge
    trackScrollPosition();
    
    // Mention autocomplete için input event listener
    setupMentionAutocomplete();
    
    // Mobile: Klavye açılınca/kapanınca scroll pozisyonunu düzelt
    if ('visualViewport' in window) {
        let lastHeight = window.visualViewport.height;
        
        window.visualViewport.addEventListener('resize', () => {
            const currentHeight = window.visualViewport.height;
            const heightDiff = lastHeight - currentHeight;
            const isKeyboardOpening = heightDiff > 50; // Boyut önemli ölçüde azaldıysa
            const isKeyboardClosing = heightDiff < -50; // Boyut önemli ölçüde arttıysa
            
            // Body'ye class ekle/çıkar (CSS optimizasyonları için)
            if (isKeyboardOpening) {
                document.body.classList.add('keyboard-open');
            } else if (isKeyboardClosing) {
                document.body.classList.remove('keyboard-open');
            }
            
            // Kullanıcı en alttaysa veya klavye hareket ediyorsa scroll'u tazele
            if (state.chatMessages && (state.isAtBottom || isKeyboardOpening || isKeyboardClosing)) {
                // Kısa bir gecikme ile DOM'un yerleşmesini bekle
                setTimeout(() => {
                    scrollToBottom(isKeyboardOpening ? 'auto' : 'smooth');
                }, 100);
            }
            
            lastHeight = currentHeight;
        });
    }
};

// En aşağıya kaydır
export const scrollToBottom = (behavior = 'smooth') => {
    if (!state.chatMessages) return;
    state.chatMessages.scrollTo({
        top: state.chatMessages.scrollHeight,
        behavior: behavior
    });
};

// Room users'ı güncelle (mention için)
export const setRoomUsers = (users) => {
    state.roomUsers = users || [];
};

export const setCurrentUsername = (username) => {
    state.currentUsername = username;
};

// ============== Reply Fonksiyonları ==============
export const setReplyingTo = (username, message, avatar, msgId = null) => {
    state.replyingTo = { username, message, avatar, msgId };
    updateReplyPreviewUI();
    
    // Input'a focus
    const input = document.getElementById('chat-input');
    if (input) input.focus();
};

export const clearReply = () => {
    state.replyingTo = null;
    updateReplyPreviewUI();
};

export const getReplyingTo = () => state.replyingTo;

// Orijinal mesaja scroll et
export const scrollToReplyMessage = (element) => {
    const targetId = element.dataset.replyTarget;
    const targetUsername = element.dataset.replyUsername;
    const targetMessage = element.dataset.replyMessage;
    
    let targetElement = null;
    
    // Önce ID ile bulmaya çalış
    if (targetId) {
        targetElement = document.getElementById(targetId);
    }
    
    // ID bulunamazsa username + message ile ara
    if (!targetElement && targetUsername && targetMessage) {
        const allMessages = document.querySelectorAll('.wp-chat-message-wrapper');
        for (const msg of allMessages) {
            if (msg.dataset.username === targetUsername && 
                msg.dataset.message === targetMessage) {
                targetElement = msg;
                break;
            }
        }
    }
    
    if (targetElement) {
        // Scroll et
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Highlight efekti
        targetElement.classList.add('wp-message-highlight');
        setTimeout(() => {
            targetElement.classList.remove('wp-message-highlight');
        }, 2000);
    }
};

const updateReplyPreviewUI = () => {
    const chatInputContainer = document.querySelector('.wp-chat-input');
    if (!chatInputContainer) return;
    
    let preview = document.getElementById('reply-preview');
    
    if (!state.replyingTo) {
        if (preview) preview.remove();
        return;
    }
    
    if (!preview) {
        preview = document.createElement('div');
        preview.id = 'reply-preview';
        preview.className = 'wp-reply-preview';
        chatInputContainer.parentNode.insertBefore(preview, chatInputContainer);
    }
    
    // Mesajı kısalt (30 karakter)
    const shortMessage = state.replyingTo.message.length > 30 
        ? state.replyingTo.message.substring(0, 30) + '...' 
        : state.replyingTo.message;
    
    preview.innerHTML = `
        <div class="wp-reply-preview-content">
            <i class="fas fa-reply"></i>
            <span class="wp-reply-preview-username">${escapeHtml(state.replyingTo.username)}</span>
            <span class="wp-reply-preview-text">${escapeHtml(shortMessage)}</span>
        </div>
        <button type="button" class="wp-reply-cancel" onclick="window.cancelReply()" title="İptal">
            <i class="fas fa-times"></i>
        </button>
    `;
};

export const addChatMessage = (username, avatar, message, timestamp = null, isHistoryLoad = false, replyTo = null) => {
    if (!state.chatMessages) return;

    // Mesaj gelince typing indicator'ı kaldır
    hideTypingIndicator(username);

    // Remove welcome message if exists
    const welcomeMsg = state.chatMessages.querySelector('.wp-chat-welcome');
    if (welcomeMsg) welcomeMsg.remove();

    const time = timestamp
        ? new Date(timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        : new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    
    // Unique mesaj ID oluştur
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const isSelf = state.currentUsername && username === state.currentUsername;
    
    // ÖNEMLİ: Mesaj eklenmeden ÖNCE scroll pozisyonunu kontrol et
    const wasNearBottom = !isHistoryLoad && (
        state.chatMessages.scrollHeight - state.chatMessages.scrollTop - state.chatMessages.clientHeight < 100
    );

    // Notification kontrolü (kendi mesajım değilse ve history yüklemesi değilse)
    const isNotification = !isSelf && !isHistoryLoad && checkForNotification(username, message, replyTo);

    const msgElement = document.createElement('div');
    msgElement.className = `wp-chat-message-wrapper ${isSelf ? 'wp-chat-message-wrapper-self' : ''}`;
    msgElement.id = msgId;
    msgElement.dataset.username = username;
    msgElement.dataset.message = message.substring(0, 50); // İlk 50 karakter
    
    // Reply HTML'i oluştur (varsa) - daha kompakt, tıklanabilir
    let replyHtml = '';
    if (replyTo) {
        const shortReplyMsg = replyTo.message.length > 40 
            ? replyTo.message.substring(0, 40) + '...' 
            : replyTo.message;
        // replyTo.msgId varsa kullan, yoksa username+message ile bul
        const replyTargetId = replyTo.msgId || '';
        replyHtml = `
            <div class="wp-chat-reply-ref" data-reply-target="${replyTargetId}" data-reply-username="${escapeHtml(replyTo.username)}" data-reply-message="${escapeHtml(replyTo.message.substring(0, 50))}" onclick="window.scrollToReplyMessage(this)" title="Orijinal mesaja git">
                <i class="fas fa-reply"></i>
                <span class="wp-reply-ref-avatar">${replyTo.avatar}</span>
                <span class="wp-reply-ref-username">${escapeHtml(replyTo.username)}:</span>
                <span class="wp-reply-ref-text">${parseMentions(escapeHtml(shortReplyMsg))}</span>
            </div>
        `;
    }
    
    // Reply butonu (mesaj dışında - wrapper içinde) - msgId ile
    const replyBtnHtml = `
        <button type="button" class="wp-chat-reply-btn" 
            onclick="window.replyToMessage('${escapeHtml(username).replace(/'/g, "\\'")}', '${escapeHtml(message).replace(/'/g, "\\'")}', '${avatar}', '${msgId}')"
            title="Yanıtla">
            <i class="fas fa-reply"></i>
        </button>
    `;
    
    // Mesaj metnini mention highlight ile render et
    const highlightedMessage = parseMentions(escapeHtml(message));
    
    msgElement.innerHTML = `
        ${isSelf ? replyBtnHtml : ''}
        <div class="wp-chat-message ${isSelf ? 'wp-chat-message-self' : ''} ${replyTo ? 'has-reply' : ''} ${isNotification ? 'has-notification' : ''}">
            <div class="wp-chat-content">
                ${replyHtml}
                <div class="wp-chat-username"><span class="wp-chat-avatar">${avatar}</span>${escapeHtml(username)}</div>
                <div class="wp-chat-text">${highlightedMessage}</div>
                <div class="wp-chat-time">${time}</div>
            </div>
        </div>
        ${isSelf ? '' : replyBtnHtml}
    `;

    // Typing indicator'ı bul - varsa onun önüne ekle, yoksa sona ekle
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        state.chatMessages.insertBefore(msgElement, typingIndicator);
    } else {
        state.chatMessages.appendChild(msgElement);
    }
    
    // Track unread messages (only for others' messages AND not history load)
    if (!isSelf && !isHistoryLoad) incrementUnread();
    
    // Akıllı auto-scroll
    // Sadece kullanıcı zaten en alttaysa veya kendi mesajıysa scroll et
    if (!isHistoryLoad && (wasNearBottom || isSelf)) {
        scrollToBottom('smooth');
    }
    
    return msgId; // ID'yi döndür
};

export const addSystemMessage = (message) => {
    if (!state.chatMessages) return;
    
    // Sistem mesajı eklemeden ÖNCE scroll pozisyonunu kontrol et
    const wasNearBottom = 
        state.chatMessages.scrollHeight - state.chatMessages.scrollTop - state.chatMessages.clientHeight < 100;

    const msgElement = document.createElement('div');
    msgElement.className = 'wp-chat-system';
    msgElement.textContent = message;
    
    // Typing indicator'ı bul - varsa onun önüne ekle, yoksa sona ekle
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        state.chatMessages.insertBefore(msgElement, typingIndicator);
    } else {
        state.chatMessages.appendChild(msgElement);
    }
    
    // Sadece kullanıcı alttaysa scroll et
    if (wasNearBottom) {
        scrollToBottom('auto');
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
    const overlayViewers = document.querySelector('.wp-overlay-viewers');
    const overlayViewerCount = document.getElementById('overlay-viewer-count');
    if (overlayViewerCount) {
        overlayViewerCount.textContent = users.length.toString();
        flashOverlayElement(overlayViewers);
    }
};

// Belirli bir overlay elementini geçici olarak göster
const flashOverlayElement = (element) => {
    if (!element) return;
    
    element.classList.add('flash-visible');
    
    // Önceki timeout'u temizle
    if (element._hideTimeout) clearTimeout(element._hideTimeout);
    
    // 3 saniye sonra gizle
    element._hideTimeout = setTimeout(() => {
        element.classList.remove('flash-visible');
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
    newMessages.forEach(msg => addChatMessage(
        msg.username, 
        msg.avatar, 
        msg.message, 
        msg.timestamp, 
        isInitialLoad,
        msg.reply_to || null
    ));
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
    
    // Indicator her zaman en altta olmalı
    // Eğer indicator parent'in son child'ı değilse, en sona taşı
    if (indicator.nextSibling) {
        state.chatMessages.appendChild(indicator);
    }
    
    // Sadece kullanıcı alttaysa scroll et
    if (wasNearBottom) {
        scrollToBottom('auto');
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

// ============== Mention Autocomplete ==============
const setupMentionAutocomplete = () => {
    const input = document.getElementById('chat-input');
    if (!input) return;
    
    input.addEventListener('input', handleMentionInput);
    input.addEventListener('keydown', handleMentionKeydown);
    
    // Click outside to close dropdown
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.wp-mention-dropdown') && !e.target.closest('#chat-input')) {
            closeMentionDropdown();
        }
    });
};

const handleMentionInput = (e) => {
    const input = e.target;
    const value = input.value;
    const cursorPos = input.selectionStart;
    
    // Cursor'dan geriye doğru @ ara
    let mentionStart = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
        if (value[i] === '@') {
            mentionStart = i;
            break;
        }
        if (value[i] === ' ' || value[i] === '\n') break;
    }
    
    if (mentionStart >= 0) {
        const query = value.substring(mentionStart + 1, cursorPos).toLowerCase();
        state.mentionQuery = query;
        state.mentionStartIndex = mentionStart;
        
        // Filtrelenmiş kullanıcılar (kendisi hariç)
        const filteredUsers = state.roomUsers.filter(u => 
            u.username !== state.currentUsername &&
            u.username.toLowerCase().includes(query)
        );
        
        if (filteredUsers.length > 0) {
            showMentionDropdown(filteredUsers, input);
        } else {
            closeMentionDropdown();
        }
    } else {
        closeMentionDropdown();
    }
};

const handleMentionKeydown = (e) => {
    if (!state.mentionDropdownOpen) return;
    
    const dropdown = document.getElementById('mention-dropdown');
    if (!dropdown) return;
    
    const items = dropdown.querySelectorAll('.wp-mention-item');
    
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.selectedMentionIndex = Math.min(state.selectedMentionIndex + 1, items.length - 1);
        updateMentionSelection(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.selectedMentionIndex = Math.max(state.selectedMentionIndex - 1, 0);
        updateMentionSelection(items);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (items[state.selectedMentionIndex]) {
            e.preventDefault();
            const username = items[state.selectedMentionIndex].dataset.username;
            insertMention(username);
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        closeMentionDropdown();
    }
};

const updateMentionSelection = (items) => {
    items.forEach((item, idx) => {
        item.classList.toggle('selected', idx === state.selectedMentionIndex);
    });
};

const showMentionDropdown = (users, input) => {
    let dropdown = document.getElementById('mention-dropdown');
    
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'mention-dropdown';
        dropdown.className = 'wp-mention-dropdown';
        input.parentNode.appendChild(dropdown);
    }
    
    state.selectedMentionIndex = 0;
    state.mentionDropdownOpen = true;
    
    dropdown.innerHTML = users.slice(0, 5).map((user, idx) => `
        <div class="wp-mention-item ${idx === 0 ? 'selected' : ''}" 
             data-username="${escapeHtml(user.username)}"
             onclick="window.selectMention('${escapeHtml(user.username).replace(/'/g, "\\'")}')">
            <span class="wp-mention-avatar">${user.avatar}</span>
            <span class="wp-mention-username">${escapeHtml(user.username)}</span>
            ${user.is_host ? '<span class="wp-mention-host">👑</span>' : ''}
        </div>
    `).join('');
    
    dropdown.style.display = 'block';
};

const closeMentionDropdown = () => {
    const dropdown = document.getElementById('mention-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    state.mentionDropdownOpen = false;
    state.selectedMentionIndex = 0;
};

const insertMention = (username) => {
    const input = document.getElementById('chat-input');
    if (!input) return;
    
    const value = input.value;
    const before = value.substring(0, state.mentionStartIndex);
    const after = value.substring(input.selectionStart);
    
    input.value = `${before}@${username} ${after}`;
    
    // Cursor'ı mention'dan sonraya taşı
    const newPos = state.mentionStartIndex + username.length + 2;
    input.setSelectionRange(newPos, newPos);
    input.focus();
    
    closeMentionDropdown();
};

// Global function for onclick
window.selectMention = insertMention;

// ============== Mention Parsing ==============
export const parseMentions = (text) => {
    // @username pattern'i bul ve highlight et
    const mentionRegex = /@(\w+)/g;
    return text.replace(mentionRegex, (match, username) => {
        // Kullanıcı odada mı kontrol et
        const isValidUser = state.roomUsers.some(u => u.username.toLowerCase() === username.toLowerCase());
        const isSelf = state.currentUsername && username.toLowerCase() === state.currentUsername.toLowerCase();
        
        if (isValidUser) {
            const className = isSelf ? 'wp-mention wp-mention-self' : 'wp-mention';
            return `<span class="${className}">@${escapeHtml(username)}</span>`;
        }
        return match;
    });
};

// ============== Notification System ==============
export const checkForNotification = (username, message, replyTo) => {
    if (!state.currentUsername) return;
    
    let shouldNotify = false;
    let notificationType = '';
    let notificationMessage = '';
    
    // Reply kontrolü
    if (replyTo && replyTo.username === state.currentUsername) {
        shouldNotify = true;
        notificationType = 'reply';
        notificationMessage = `${username} mesajınıza yanıt verdi`;
    }
    
    // Mention kontrolü
    const mentionRegex = new RegExp(`@${state.currentUsername}\\b`, 'i');
    if (mentionRegex.test(message)) {
        shouldNotify = true;
        notificationType = 'mention';
        notificationMessage = `${username} sizi etiketledi`;
    }
    
    if (shouldNotify && notificationCallback) {
        notificationCallback({
            type: notificationType,
            from: username,
            message: notificationMessage,
            originalMessage: message
        });
    }
    
    return shouldNotify;
};

