import { HighQConfig } from '../core/config';
import { postXml, putXml } from '../core/http';
import { escapeXml } from '../utils/xml';

// Types supported by the write layer so far.
export type ColumnType = 'text' | 'choice' | 'hyperlink';

export interface HyperlinkValue {
  linkdisplayname?: string;
  linkdisplayurl: string;
}

export type FieldValue =
  | string
  | number
  | HyperlinkValue
  | null
  | undefined;

export interface ColumnSchema {
  colId: string;
  type: ColumnType;
}

export type IsheetSchema = Record<string, ColumnSchema>;

export type ItemData = Record<string, FieldValue>;

export interface BuildItemXmlOptions {
  itemId?: string | number | null;
  includeDate?: boolean;
  onlyKeys?: string[] | null;
  dateFieldKey?: string;
  dateColumnId?: string;
}

export interface ItemRequestOptions extends BuildItemXmlOptions {
  apiBaseUrl?: string;

  /**
   * If a choice value is passed as a label, resolve it to HighQ's choice ID.
   * Enabled by default.
   */
  resolveChoiceLabels?: boolean;
}

interface ChoiceOption {
  id: string;
  label: string;
}

/**
 * Cache is per API base URL + iSheet. Each entry maps column ID -> choices.
 */
const columnChoicesCache = new Map<string, Record<string, ChoiceOption[]>>();

function cdata(value: string): string {
  const safe = String(value ?? '').replace(/]]>/g, ']]]]><![CDATA[>');
  return `<![CDATA[${safe}]]>`;
}

function xmlToday(dateValue: string, colId: string): string {
  return `
<column attributecolumnid="${escapeXml(colId)}">
  <rawdata>
    <date>${escapeXml(dateValue)}</date>
    <time>00:00:00</time>
  </rawdata>
</column>`;
}

function xmlColumn(
  colId: string,
  value: FieldValue,
  type: ColumnType = 'text'
): string {
  if (value == null || value === '') return '';

  if (type === 'choice') {
    return `
<column attributecolumnid="${escapeXml(colId)}">
  <rawdata>
    <choices>
      <choice><id>${escapeXml(String(value))}</id></choice>
    </choices>
  </rawdata>
</column>`;
  }

  if (type === 'hyperlink') {
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(
        `Hyperlink column ${colId} expects { linkdisplayname?, linkdisplayurl }.`
      );
    }

    const link = value as HyperlinkValue;
    const name = link.linkdisplayname || link.linkdisplayurl || '';
    const url = link.linkdisplayurl || '';

    if (!name && !url) return '';

    return `
<column attributecolumnid="${escapeXml(colId)}">
  <rawdata>
    <linkdisplayname>${cdata(name)}</linkdisplayname>
    <linkdisplayurl>${cdata(url)}</linkdisplayurl>
  </rawdata>
</column>`;
  }

  return `
<column attributecolumnid="${escapeXml(colId)}">
  <rawdata><value>${cdata(String(value))}</value></rawdata>
</column>`;
}

export function buildItemXML(
  item: ItemData,
  schema: IsheetSchema,
  {
    itemId = null,
    includeDate = true,
    onlyKeys = null,
    dateFieldKey = 'Fecha',
    dateColumnId = '165373'
  }: BuildItemXmlOptions = {}
): string {
  let body = '';

  if (includeDate && dateFieldKey && dateColumnId && item[dateFieldKey]) {
    body += xmlToday(String(item[dateFieldKey]), dateColumnId);
  }

  const entries: [string, FieldValue][] = onlyKeys
    ? onlyKeys.map(key => [key, item[key]] as [string, FieldValue])
    : Object.entries(item) as [string, FieldValue][];

  for (const [key, value] of entries) {
    const isAutoDate =
      includeDate &&
      dateFieldKey &&
      dateColumnId &&
      key === dateFieldKey &&
      Boolean(item[dateFieldKey]);

    if (isAutoDate) continue;

    const def = schema[key];
    if (!def) continue;

    body += xmlColumn(def.colId, value, def.type);
  }

  const idAttr = itemId != null ? ` itemid="${escapeXml(String(itemId))}"` : '';

  return `<item${idAttr}>${body}</item>`;
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

async function fetchChoiceOptions(
  isheetId: string | number,
  columnId: string | number,
  apiBaseUrl: string
): Promise<ChoiceOption[]> {
  const cacheKey = `${apiBaseUrl}::${isheetId}`;
  const colKey = String(columnId);

  const cached = columnChoicesCache.get(cacheKey);
  if (cached?.[colKey]) {
    return cached[colKey];
  }

  const url = `${apiBaseUrl}/isheets/admin/${isheetId}/columns`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/xml' }
  });

  const xml = await res.text();

  if (!res.ok) {
    throw new Error(
      `No se pudieron obtener las columnas del iSheet: ` +
      `${res.status} ${res.statusText}${xml ? ` - ${xml}` : ''}`
    );
  }

  const choicesByColumn = parseColumnChoicesXml(xml);
  columnChoicesCache.set(cacheKey, choicesByColumn);

  return choicesByColumn[colKey] || [];
}

function parseColumnChoicesXml(xml: string): Record<string, ChoiceOption[]> {
  const byColumn: Record<string, ChoiceOption[]> = {};

  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');

      const parserError = doc.getElementsByTagName('parsererror')[0];
      if (!parserError) {
        const columns = Array.from(doc.getElementsByTagName('column'));

        columns.forEach(col => {
          const id =
            col.getElementsByTagName('columnid')[0]?.textContent?.trim() || '';

          if (!id) return;

          const choices = Array.from(col.getElementsByTagName('choice'))
            .map(choice => ({
              id:
                choice.getElementsByTagName('id')[0]?.textContent?.trim() || '',
              label:
                choice.getElementsByTagName('label')[0]?.textContent?.trim() || ''
            }))
            .filter(c => c.id && c.label);

          if (choices.length) {
            byColumn[id] = choices;
          }
        });

        return byColumn;
      }
    } catch {
      // Fall through to regex parser.
    }
  }

  const columnRegex = /<column>([\s\S]*?)<\/column>/gi;
  let colMatch: RegExpExecArray | null;

  while ((colMatch = columnRegex.exec(xml)) !== null) {
    const block = colMatch[1];

    const idMatch = block.match(/<columnid>([^<]*)<\/columnid>/i);
    const colId = idMatch ? idMatch[1].trim() : '';

    if (!colId) continue;

    const choices: ChoiceOption[] = [];
    const choiceRegex = /<choice>([\s\S]*?)<\/choice>/gi;
    let choiceMatch: RegExpExecArray | null;

    while ((choiceMatch = choiceRegex.exec(block)) !== null) {
      const part = choiceMatch[1];

      const id = (
        part.match(/<id>([^<]*)<\/id>/i)?.[1] || ''
      ).trim();

      const label = (
        part.match(/<label><!\[CDATA\[([\s\S]*?)\]\]><\/label>/i)?.[1] ||
        part.match(/<label>([^<]*)<\/label>/i)?.[1] ||
        ''
      ).trim();

      if (id && label) {
        choices.push({ id, label });
      }
    }

    if (choices.length) {
      byColumn[colId] = choices;
    }
  }

  return byColumn;
}

async function resolveChoiceValue(
  value: FieldValue,
  isheetId: string | number,
  colId: string | number,
  apiBaseUrl: string
): Promise<FieldValue> {
  if (value == null) return value;

  if (typeof value === 'number') return value;

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  if (typeof value === 'string') {
    const options = await fetchChoiceOptions(
      isheetId,
      colId,
      apiBaseUrl
    );

    const label = normalizeLabel(value);
    const match = options.find(
      opt => normalizeLabel(opt.label) === label
    );

    if (!match) {
      throw new Error(
        `No se encontró el choice "${value}" en la columna ${colId}.`
      );
    }

    return match.id;
  }

  return value;
}

async function normalizeChoiceValues(
  item: ItemData,
  schema: IsheetSchema,
  isheetId: string | number,
  apiBaseUrl: string
): Promise<ItemData> {
  const result: ItemData = { ...item };

  for (const [key, def] of Object.entries(schema)) {
    if (def.type !== 'choice') continue;
    if (!(key in item)) continue;

    result[key] = await resolveChoiceValue(
      item[key],
      isheetId,
      def.colId,
      apiBaseUrl
    );
  }

  return result;
}

/**
 * Creates a new item:
 * POST /api/3/isheet/{id}/items
 */
export async function saveNewItem(
  isheetId: string | number,
  item: ItemData,
  schema: IsheetSchema,
  options: ItemRequestOptions = {}
): Promise<any> {
  const {
    apiBaseUrl = HighQConfig.getBaseUrl(),
    includeDate = true,
    resolveChoiceLabels = true,
    ...buildOpts
  } = options;

  const normalizedItem = resolveChoiceLabels
    ? await normalizeChoiceValues(item, schema, isheetId, apiBaseUrl)
    : item;

  const itemXml = buildItemXML(normalizedItem, schema, {
    ...buildOpts,
    includeDate,
    itemId: null
  });

  const xml = `<isheet><data>${itemXml}</data></isheet>`;
  const url = `${apiBaseUrl}/isheet/${isheetId}/items`;

  const res = await postXml(url, xml, {
    accept: 'application/json'
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Error al crear ítem: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`
    );
  }

  return res.json();
}

/**
 * Updates an existing item:
 * PUT /api/3/isheet/{id}/items/{itemId}
 */
export async function updateItem(
  isheetId: string | number,
  itemId: string | number,
  item: ItemData,
  schema: IsheetSchema,
  options: ItemRequestOptions = {}
): Promise<Response> {
  const {
    apiBaseUrl = HighQConfig.getBaseUrl(),
    includeDate = true,
    resolveChoiceLabels = true,
    ...buildOpts
  } = options;

  const normalizedItem = resolveChoiceLabels
    ? await normalizeChoiceValues(item, schema, isheetId, apiBaseUrl)
    : item;

  const itemXml = buildItemXML(normalizedItem, schema, {
    ...buildOpts,
    includeDate,
    itemId
  });

  const xml = `<isheet><data>${itemXml}</data></isheet>`;
  const url = `${apiBaseUrl}/isheet/${isheetId}/items/${itemId}`;

  const res = await putXml(url, xml, {
    accept: 'application/json'
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Error al actualizar ítem: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`
    );
  }

  return res;
}

/**
 * Clears cached choice metadata. Useful during development after changing
 * choice definitions in HighQ.
 */
export function clearChoiceCache(): void {
  columnChoicesCache.clear();
}
