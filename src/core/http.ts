export type HeaderMap = Record<string, string>;

export async function getJson<T = unknown>(
  url: string,
  extraHeaders: HeaderMap = {}
): Promise<T> {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      ...extraHeaders
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `HighQTools GET failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`
    );
  }

  return (await res.json()) as T;
}

export async function postXml(
  url: string,
  xml: string,
  extraHeaders: HeaderMap = {}
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/xml',
      ...extraHeaders
    },
    body: xml
  });
}

export async function putXml(
  url: string,
  xml: string,
  extraHeaders: HeaderMap = {}
): Promise<Response> {
  return fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/xml',
      ...extraHeaders
    },
    body: xml
  });
}
