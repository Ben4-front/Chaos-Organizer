import '../css/style.css';
import API from './api';
import CryptoJS from 'crypto-js';
import JSZip from 'jszip';

const SERVER_URL = 'http://localhost:7070'; 
const api = new API(SERVER_URL);

const container = document.getElementById('messages-container');
const input = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-input');
const recordBtn = document.getElementById('record-btn');
const geoBtn = document.getElementById('geo-btn');
const encryptBtn = document.getElementById('encrypt-btn');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPopup = document.getElementById('emoji-popup');
const searchInput = document.getElementById('search-input');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importInput = document.getElementById('import-input');
const dragOverlay = document.getElementById('drag-overlay');
const pinnedBlock = document.getElementById('pinned-container');
const filterBtns = document.querySelectorAll('.categories li');

let messages = [];
let currentFilter = 'all';
let isRecording = false;
let isEncryptionMode = false;
let mediaRecorder = null;
let audioChunks = [];

const EMOJIS = ['😀','😃','😄','😁','😆','😅','😂','🤣','☺️','😊','😇','🙂','😉','😍','🥰','😘','😜','😎','🤩','🥳','😏','😢','😭','😤','😠','🤬','🤯','😱','🥶','🥱','😴','🤡','💩','👻','💀','👽','👾','🤖','😺'];
const STICKERS = [
    'https://img.icons8.com/fluency/96/cat.png',
    'https://img.icons8.com/fluency/96/doge.png',
    'https://img.icons8.com/fluency/96/fire-element.png',
    'https://img.icons8.com/fluency/96/clown.png'        
];


initEmojiPopup();

api.initWS((data) => {
    if (data.type === 'new_message') {
        messages.push(data.data);
        if (shouldShowMessage(data.data)) {
            renderMessage(data.data);
            scrollToBottom();
        }
    } else if (data.type === 'pin_message') {
        updatePinnedMessage(data.id);
    } else if (data.type === 'update_message') {
        const idx = messages.findIndex(m => m.id === data.data.id);
        if (idx !== -1) {
            messages[idx] = data.data;
            rerender();
        }
    } else if (data.type === 'history_updated') {
        messages = [];
        loadMessages();
        alert('История чата была обновлена сервером');
    }
});

loadMessages();


sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage() });

encryptBtn.addEventListener('click', () => {
    isEncryptionMode = !isEncryptionMode;
    encryptBtn.classList.toggle('active', isEncryptionMode);
    input.placeholder = isEncryptionMode ? '🔒 Введите секретное сообщение...' : 'Введите сообщение...';
});

attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    await handleFiles(files);
    fileInput.value = '';
});

document.addEventListener('dragover', (e) => { e.preventDefault(); dragOverlay.classList.remove('hidden'); });
dragOverlay.addEventListener('dragleave', (e) => { e.preventDefault(); dragOverlay.classList.add('hidden'); });
dragOverlay.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragOverlay.classList.add('hidden');
    const files = Array.from(e.dataTransfer.files);
    await handleFiles(files);
});

recordBtn.addEventListener('click', async () => {
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
            mediaRecorder.onstop = async () => {
                const blob = new Blob(audioChunks, { type: 'audio/wav' });
                const file = new File([blob], 'voice.wav', { type: 'audio/wav' });
                await uploadAndSend(file);
            };
            mediaRecorder.start();
            isRecording = true;
            recordBtn.classList.add('recording');
        } catch (e) {
            alert('Нет доступа к микрофону');
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.classList.remove('recording');
    }
});

geoBtn.addEventListener('click', () => {
    if (!navigator.geolocation) return alert('Геолокация не поддерживается');
    geoBtn.classList.add('recording');
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            geoBtn.classList.remove('recording');
            api.sendMessage('new_message', { type: 'geo', content: `${pos.coords.latitude},${pos.coords.longitude}` });
        },
        (err) => {
            geoBtn.classList.remove('recording');
            alert('Ошибка получения геопозиции');
        }
    );
});

emojiBtn.addEventListener('click', () => emojiPopup.classList.toggle('hidden'));
document.querySelectorAll('.popup-tabs .tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.popup-content').forEach(c => c.classList.add('hidden'));
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab === 'emoji' ? 'emoji-list' : 'sticker-list').classList.remove('hidden');
    });
});

searchInput.addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    if (!query) { loadMessages(); return; }
    messages = await api.searchMessages(query);
    rerender();
});

exportBtn.addEventListener('click', () => window.open(`${SERVER_URL}/export`, '_blank'));

importBtn.addEventListener('click', () => importInput.click());
importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const json = JSON.parse(ev.target.result);
            if (!Array.isArray(json)) throw new Error();
            const res = await api.importHistory(json);
            if (res.success) alert('Импорт успешен!');
        } catch (err) {
            alert('Ошибка импорта: Неверный файл');
        }
    };
    reader.readAsText(file);
    importInput.value = '';
});

container.addEventListener('scroll', async () => {
    if (container.scrollTop === 0 && messages.length > 0) {
        const oldHeight = container.scrollHeight;
        const newHistory = await api.getHistory(messages[0].id);
        if (newHistory.length > 0) {
            messages = [...newHistory, ...messages];
            rerender();
            container.scrollTop = container.scrollHeight - oldHeight;
        }
    }
});

filterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        filterBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentFilter = e.target.dataset.filter;
        rerender();
    });
});



function initEmojiPopup() {
    const eList = document.getElementById('emoji-list');
    EMOJIS.forEach(char => {
        const s = document.createElement('span');
        s.textContent = char;
        s.className = 'emoji-item';
        s.onclick = () => { input.value += char; input.focus(); };
        eList.appendChild(s);
    });
    const sList = document.getElementById('sticker-list');
    STICKERS.forEach(url => {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'sticker-item';
        img.onclick = () => {
            api.sendMessage('new_message', { type: 'sticker', content: url });
            emojiPopup.classList.add('hidden');
        };
        sList.appendChild(img);
    });
}

function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    if (isEncryptionMode) {
        const password = prompt('Пароль для шифрования:');
        if (!password) return;
        const encrypted = CryptoJS.AES.encrypt(text, password).toString();
        api.sendMessage('new_message', { type: 'text', content: encrypted, isEncrypted: true });
    } else {
        api.sendMessage('new_message', { type: 'text', content: text });
    }
    input.value = '';
}

async function handleFiles(files) {
    if (files.length === 0) return;
    if (files.length > 1) {
        if (confirm(`Сжать ${files.length} файлов в ZIP архив?`)) {
            await createZipAndSend(files);
        } else {
            for (const f of files) await uploadAndSend(f);
        }
    } else {
        await uploadAndSend(files[0]);
    }
}

async function createZipAndSend(files) {
    const zip = new JSZip();
    files.forEach(f => zip.file(f.name, f));
    try {
        const content = await zip.generateAsync({ type: 'blob' });
        const zipFile = new File([content], `archive_${Date.now()}.zip`, { type: 'application/zip' });
        await uploadAndSend(zipFile);
    } catch (e) {
        console.error(e);
        alert('Ошибка архивации');
    }
}

async function uploadAndSend(file) {
    try {
        const res = await api.uploadFile(file);
        let type = 'file';
        if (res.type.startsWith('image')) type = 'image';
        if (res.type.startsWith('audio')) type = 'audio';
        if (res.type.startsWith('video')) type = 'video';
        
        api.sendMessage('new_message', { type, content: res.url, fileName: res.name });
    } catch (e) {
        alert('Ошибка загрузки файла');
    }
}

async function loadMessages() {
    messages = await api.getHistory();
    rerender();
    scrollToBottom();
}

function shouldShowMessage(msg) {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'favorites') return msg.isFavorite;
    return msg.type === currentFilter;
}

function rerender() {
    container.innerHTML = '';
    messages.filter(shouldShowMessage).forEach(renderMessage);
}

function renderMessage(msg) {
    const div = document.createElement('div');
    div.className = `message ${msg.sender === 'bot' ? 'bot' : 'me'}`;
    
    let contentHtml = '';

    if (msg.isEncrypted) {
        contentHtml = `
            <div class="encrypted-msg" onclick="decryptMessage(this, '${msg.content}')">
                🔒 Секретное сообщение <br><small>(Нажми)</small>
            </div>
        `;
    } else if (msg.type === 'sticker') {
        contentHtml = `<img src="${msg.content}" class="sticker-msg">`;
    } else if (msg.type === 'geo') {
        contentHtml = `<div class="geo-message"><a href="https://maps.google.com/?q=${msg.content}" target="_blank">📍 Геолокация</a></div>`;
    } else if (msg.type === 'text') {
        contentHtml = msg.content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
    } else if (msg.type === 'image') {
        contentHtml = `<img src="${msg.content}" class="media-content">`;
    } else if (msg.type === 'video') {
        contentHtml = `<video src="${msg.content}" controls class="media-content"></video>`;
    } else if (msg.type === 'audio') {
        contentHtml = `<audio src="${msg.content}" controls></audio>`;
    } else {
        contentHtml = `<a href="${msg.content}" download="${msg.fileName}">💾 ${msg.fileName}</a>`;
    }

    div.innerHTML = `
        <div class="message-controls">
            <span class="fav-btn ${msg.isFavorite ? 'active' : ''}">★</span>
            <span class="pin-btn">📌</span>
        </div>
        <div class="message-content">${contentHtml}</div>
        <div class="message-date">${new Date(msg.date).toLocaleTimeString()}</div>
    `;

    div.querySelector('.fav-btn').onclick = () => api.sendEvent('toggle_favorite', { id: msg.id });
    div.querySelector('.pin-btn').onclick = () => api.sendEvent('pin_message', { id: msg.id });
    container.appendChild(div);
}

window.decryptMessage = (el, content) => {
    const pass = prompt('Пароль:');
    if (!pass) return;
    try {
        const bytes = CryptoJS.AES.decrypt(content, pass);
        const text = bytes.toString(CryptoJS.enc.Utf8);
        if (!text) throw new Error();
        el.outerHTML = `<span>${text}</span>`;
    } catch (e) {
        alert('Неверный пароль');
    }
};

function scrollToBottom() {
    container.scrollTop = container.scrollHeight;
}

function updatePinnedMessage(id) {
    const msg = messages.find(m => m.id === id);
    if (msg) {
        pinnedBlock.classList.remove('hidden');
        pinnedBlock.querySelector('.pin-content').textContent = msg.type === 'text' ? msg.content : `[${msg.type}]`;
        pinnedBlock.onclick = (e) => {
            if (e.target.classList.contains('pin-remove')) { pinnedBlock.classList.add('hidden'); return; }
            const el = document.querySelector(`.message[data-id="${id}"]`);
        };
    } else {
        pinnedBlock.classList.add('hidden');
    }
}