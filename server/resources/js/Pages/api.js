export async function api(path, init = {}) {
  const isFormData = init.body instanceof FormData;
  const organizationId = typeof window === 'undefined' ? null : window.localStorage.getItem('mymdm.organization_id');
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(organizationId ? { 'X-Organization-Id': organizationId } : {}),
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    const jsonStart = text.indexOf('{');
    if (jsonStart > 0) {
      try { payload = JSON.parse(text.slice(jsonStart)); } catch { /* Réponse HTML ou texte du serveur. */ }
    }
  }

  if (response.redirected && new URL(response.url).pathname === '/login') {
    throw new Error('Votre session a expiré. Reconnectez-vous avant de relancer l’import.');
  }

  if (!response.ok) {
    const messages = payload?.errors ? Object.values(payload.errors).flat().join(' ') : payload?.message;
    throw new Error(messages || readableServerError(text, response.status));
  }

  if (payload === undefined) throw new Error(readableServerError(text, response.status));
  return payload;
}

function readableServerError(text, status) {
  const cleaned = text.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (/POST Content-Length|post_max_size|upload_max_filesize/i.test(cleaned)) return 'Le fichier dépasse la taille autorisée par le serveur ou le proxy.';
  if (status === 413) return 'Le fichier est trop volumineux pour le serveur ou le proxy.';
  return cleaned && cleaned.length < 240 ? cleaned : `Le serveur a retourné une réponse invalide (${status}). Consultez les logs du serveur.`;
}

export function dateLabel(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}
