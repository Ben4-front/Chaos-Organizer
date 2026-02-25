export default class API {
    constructor(url) {
        this.url = url;
        this.ws = null;
    }

    initWS(onMessage) {
        this.ws = new WebSocket(this.url.replace('http', 'ws'));
        this.ws.onmessage = (event) => onMessage(JSON.parse(event.data));
    }

    sendMessage(type, data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, data }));
        }
    }

    sendEvent(type, payload) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, ...payload }));
        }
    }

    async getHistory(fromId = '', count = 10) {
        const res = await fetch(`${this.url}/messages?fromId=${fromId}&count=${count}`);
        return await res.json();
    }
    
    async searchMessages(query) {
        const res = await fetch(`${this.url}/messages?search=${encodeURIComponent(query)}`);
        return await res.json();
    }

    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${this.url}/upload`, { method: 'POST', body: formData });
        return await res.json();
    }

    async importHistory(historyArray) {
        const res = await fetch(`${this.url}/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history: historyArray })
        });
        return await res.json();
    }
}