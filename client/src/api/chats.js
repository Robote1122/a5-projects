/**
 * api/chats.js
 * Все запросы к бэкенду. BASE_URL = /api (проксируется vite dev / nginx prod).
 */

const BASE = '/api';

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Ошибка сервера');
  return json.data;
}

export const api = {
  getChats:       ()             => request('GET',    '/chats'),
  createChat:     (title)        => request('POST',   '/chats', { title }),
  getChat:        (id)           => request('GET',    `/chats/${id}`),
  deleteChat:     (id)           => request('DELETE', `/chats/${id}`),
  getMessages:    (id)           => request('GET',    `/chats/${id}/messages`),
  sendMessage:    (id, role, content) =>
    request('POST', `/chats/${id}/messages`, { role, content }),
};
