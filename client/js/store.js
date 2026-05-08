// ============================================
// Store — State management with localStorage
// ============================================

const STORE_KEY = 'comepos_data';

let state = {};

export function initStore() {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) {
        try { state = JSON.parse(saved); } catch { state = {}; }
    }
}

export function getState() { return state; }

function persist() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

export function getCollection(name) {
    return state[name] || [];
}

export function setCollection(name, data) {
    state[name] = data;
    persist();
}

export function addItem(collection, item) {
    if (!state[collection]) state[collection] = [];
    state[collection].push(item);
    persist();
    return item;
}

export function updateItem(collection, id, updates) {
    const arr = state[collection] || [];
    const idx = arr.findIndex(i => i.id === id);
    if (idx !== -1) {
        arr[idx] = { ...arr[idx], ...updates };
        persist();
        return arr[idx];
    }
    return null;
}

export function deleteItem(collection, id) {
    if (!state[collection]) return;
    state[collection] = state[collection].filter(i => i.id !== id);
    persist();
}

export function getItemById(collection, id) {
    return (state[collection] || []).find(i => i.id === id) || null;
}

export function clearStore() {
    state = {};
    localStorage.removeItem(STORE_KEY);
}

export function isSeeded() {
    return state._seeded === true;
}

export function markSeeded() {
    state._seeded = true;
    persist();
}

// Session
export function setSession(user) {
    state._session = user;
    persist();
}

export function getSession() {
    return state._session || null;
}

export function clearSession() {
    delete state._session;
    persist();
}
