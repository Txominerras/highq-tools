import { HighQConfig } from '../core/config';

export interface UploadAttachmentOptions {
  apiBaseUrl?: string;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

export type AttachmentUploadInput =
  | FormData
  | {
      file: Blob;
      filename: string;
    };

export interface ProgressiveStatus {
  status: string | null;
  attachmentId: string | null;
}

export interface UploadAttachmentResult {
  progressiveKey: string;
  attachmentId: string | null;
}

/**
 * Builds the multipart body HighQ expects for attachment uploads.
 */
export function buildAttachmentFormData(
  file: Blob,
  filename: string
): FormData {
  const form = new FormData();
  form.append('file', file, filename);
  form.append('filename', filename);
  return form;
}

/**
 * Uploads a file to an iSheet and waits for HighQ's progressive operation
 * to complete.
 */
export async function uploadAttachment(
  isheetId: string | number,
  input: AttachmentUploadInput,
  options: UploadAttachmentOptions = {}
): Promise<UploadAttachmentResult> {
  const {
    apiBaseUrl = HighQConfig.getBaseUrl(),
    pollIntervalMs = 1000,
    pollTimeoutMs = 60_000
  } = options;

  const formData =
    input instanceof FormData
      ? input
      : buildAttachmentFormData(input.file, input.filename);

  const url = `${apiBaseUrl}/isheet/${isheetId}/attachment`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json'
    },
    body: formData
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Error al subir attachment: ${res.status} ${res.statusText}` +
      `${text ? ` - ${text}` : ''}`
    );
  }

  const result = await res.json();
  const progressiveKey = result?.progressivekey;

  if (!progressiveKey) {
    throw new Error(
      'No se recibió progressivekey al subir el attachment.'
    );
  }

  const status = await pollProgressiveKey(progressiveKey, {
    apiBaseUrl,
    intervalMs: pollIntervalMs,
    timeoutMs: pollTimeoutMs
  });

  return {
    progressiveKey,
    attachmentId: status.attachmentId
  };
}

export interface PollOptions {
  apiBaseUrl?: string;
  intervalMs?: number;
  timeoutMs?: number;
}

export async function pollProgressiveKey(
  progressiveKey: string,
  {
    apiBaseUrl = HighQConfig.getBaseUrl(),
    intervalMs = 1000,
    timeoutMs = 60_000
  }: PollOptions = {}
): Promise<ProgressiveStatus> {
  const url =
    `${apiBaseUrl}/progressivekeystatus/` +
    encodeURIComponent(progressiveKey);

  const start = Date.now();

  while (true) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(
        `Error consultando estado de attachment: ` +
        `${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`
      );
    }

    const parsed = parseProgressiveStatus(text);
    const normalizedStatus = parsed.status?.trim().toUpperCase();

    if (normalizedStatus === 'DONE') {
      return parsed;
    }

    if (normalizedStatus === 'FAILED') {
      throw new Error('La subida del attachment falló.');
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error(
        'Timeout esperando a que finalice la subida del attachment.'
      );
    }

    await new Promise<void>(resolve =>
      setTimeout(resolve, intervalMs)
    );
  }
}

function parseProgressiveStatus(xml: string): ProgressiveStatus {
  let status: string | null = null;
  let attachmentId: string | null = null;

  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(
        xml,
        'application/xml'
      );

      const parserError =
        doc.getElementsByTagName('parsererror')[0];

      if (!parserError) {
        status =
          doc.getElementsByTagName('progressivekeystatus')[0]
            ?.textContent || null;

        attachmentId =
          doc.getElementsByTagName('id')[0]?.textContent || null;

        return { status, attachmentId };
      }
    } catch {
      // Fall through to regex.
    }
  }

  const statusMatch = xml.match(
    /<progressivekeystatus>([^<]*)<\/progressivekeystatus>/i
  );

  const idMatch = xml.match(
    /<id>([^<]*)<\/id>/i
  );

  status = statusMatch ? statusMatch[1] : null;
  attachmentId = idMatch ? idMatch[1] : null;

  return { status, attachmentId };
}

export interface AttachAttachmentOptions {
  apiBaseUrl?: string;
  existingAttachmentIds?: Array<
    string | number | null | undefined
  >;
}

/**
 * Associates an uploaded attachment with an iSheet item/attachment column.
 */
export async function attachAttachmentToItem(
  isheetId: string | number,
  itemId: string | number,
  columnId: string | number,
  attachmentId: string | number,
  options: AttachAttachmentOptions = {}
): Promise<void> {
  const {
    apiBaseUrl = HighQConfig.getBaseUrl(),
    existingAttachmentIds = []
  } = options;

  const previousAttachments = existingAttachmentIds
    .filter(
      (id): id is string | number =>
        id !== null && id !== undefined
    )
    .map(id => ({ id: String(id) }));

  const payload = {
    data: {
      item: [
        {
          itemid: String(itemId),
          column: [
            {
              attributecolumnid: String(columnId),
              rawdata: {
                attachments: {
                  attachment: [
                    ...previousAttachments,
                    { id: String(attachmentId) }
                  ]
                }
              }
            }
          ]
        }
      ]
    }
  };

  const url =
    `${apiBaseUrl}/isheet/${isheetId}/items/${itemId}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Error al asociar attachment: ` +
      `${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`
    );
  }
}

/**
 * Extracts attachment IDs from either a raw column object or an attachment
 * node returned by HighQ.
 */
export function extractAttachmentIds(colData: any): string[] {
  const attachmentNode =
    colData?.rawdata?.attachments?.attachment ??
    colData?.attachments?.attachment;

  if (!attachmentNode) return [];

  const arr = Array.isArray(attachmentNode)
    ? attachmentNode
    : [attachmentNode];

  return arr
    .map((att: any) => att?.id?.toString())
    .filter((value: any): value is string => Boolean(value));
}
