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
      try { payload = JSON.parse(text.slice(jsonStart)); } catch { /* HTML or text response from the server. */ }
    }
  }

  if (response.redirected && new URL(response.url).pathname === '/login') {
    throw new Error('Your session has expired. Sign in again before retrying the upload.');
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
  if (/POST Content-Length|post_max_size|upload_max_filesize/i.test(cleaned)) return 'The file exceeds the size limit allowed by the server or proxy.';
  if (status === 413) return 'The file is too large for the server or proxy.';
  return cleaned && cleaned.length < 240 ? cleaned : `The server returned an invalid response (${status}). Check the server logs.`;
}

export function dateLabel(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}
