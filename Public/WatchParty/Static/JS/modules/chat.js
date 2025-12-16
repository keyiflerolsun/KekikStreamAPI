// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import { escapeHtml } from './utils.js';

// ============== State ==============
const state = {
    chatMessages: null,
    usersList: null,
    currentUsername: null
};

export const initChat = () => {
    state.chatMessages = document.getElementById('chat-messages');
    state.usersList = document.getElementById('users-list');
};

export const setCurrentUsername = (username) => {
    state.currentUsername = username;
};

export const addChatMessage = (username, avatar, message, timestamp = null) => {
    if (!state.chatMessages) return;

    // Remove welcome message if exists
    const welcomeMsg = state.chatMessages.querySelector('.wp-chat-welcome');
    if (welcomeMsg) welcomeMsg.remove();

    const time = timestamp
        ? new Date(timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        : new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    const isSelf = state.currentUsername && username === state.currentUsername;

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
    state.chatMessages.scrollTop = state.chatMessages.scrollHeight;
};

export const addSystemMessage = (message) => {
    if (!state.chatMessages) return;

    const msgElement = document.createElement('div');
    msgElement.className = 'wp-chat-system';
    msgElement.textContent = message;
    state.chatMessages.appendChild(msgElement);
    state.chatMessages.scrollTop = state.chatMessages.scrollHeight;
};

export const updateUsersList = (users) => {
    if (!state.usersList) return;

    const onlineCount = document.getElementById('online-count');

    if (!users || users.length === 0) {
        state.usersList.innerHTML = '<div class="wp-text-muted" style="padding: 0.5rem;">Henüz kimse yok</div>';
        if (onlineCount) onlineCount.textContent = '0';
        return;
    }

    state.usersList.innerHTML = users.map(user => `
        <div class="wp-user-badge ${user.is_host ? 'host' : ''}">
            <span>${user.avatar}</span>
            <span>${escapeHtml(user.username)}</span>
        </div>
    `).join('');

    if (onlineCount) onlineCount.textContent = users.length.toString();
};

export const loadChatHistory = (messages) => {
    if (!state.chatMessages || !messages) return;

    state.chatMessages.innerHTML = '';
    messages.forEach(msg => addChatMessage(msg.username, msg.avatar, msg.message, msg.timestamp));
};
