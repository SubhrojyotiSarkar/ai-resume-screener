import { api } from './client.js';

export async function login({ email, password }) {
  const { data } = await api.post('/auth/login', { email, password });
  return data; // { token, user }
}

export async function register({ name, email, password }) {
  const { data } = await api.post('/auth/register', { name, email, password });
  return data; // { token, user }
}

export async function fetchMe() {
  const { data } = await api.get('/auth/me');
  return data.user;
}
