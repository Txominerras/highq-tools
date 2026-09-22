import { HighQConfig } from '../core/config';

export interface IsheetRow {
  itemID: string;
  [key: string]: any;
}

export interface ColumnDefinition {
  id: string;
  type: string;
  columntypeid: string;
  originalName: string;
  normalizedName: string;
}

export type ColumnMap = Record<string, ColumnDefinition>;

export interface FetchIsheetOptions {
  viewId?: string | number;
  limit?: number;
  offset?: number;
  apiBaseUrl?: string;
}

export interface FetchIsheetResult {
  rows: IsheetRow[];
  columns: ColumnMap;
}

export function normalizeColumnName(columnName: string): string {
  return String(columnName)
    .toLowerCase()
    .replace(/\s+/g, '');
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function extractData(
  data: any,
  fields: string[],
  newNames: Record<string, string> = {}
): Record<string, any> {
  return fields.reduce((obj: Record<string, any>, field: string) => {
    const newKey = newNames[field] || field;
    const value = data?.[field];

    if (field === 'apiurl' && newKey === 'userID') {
      obj[newKey] =
        typeof value === 'string'
          ? value.split('/').filter(Boolean).pop()
          : value;
    } else {
      obj[newKey] = value;
    }

    return obj;
  }, {});
}

function getColumnValue(
  item: any,
  colId: string,
  colType: string,
  newNames: Record<string, string> = {}
): any {
  const column = asArray(item?.column).find(
    (col: any) => String(col?.attributecolumnid) === String(colId)
  );

  const element = column?.displaydata;

  if (!element) return '';

  switch (colType) {
    case 'SHEET_COLUMN_TYPE_LOOKUP': {
      const lookupUsers = element.lookupusers?.lookupuser;

      if (lookupUsers) {
        return asArray(lookupUsers).map((user: any) =>
          extractData(
            user,
            ['email', 'userdisplayname', 'apiurl'],
            newNames
          )
        );
      }

      // Some lookup-style values are represented as linked iSheet items.
      const lookupItems = element.isheetitems?.isheetitem;
      if (lookupItems) {
        return asArray(lookupItems).map((linked: any) =>
          extractData(linked, ['linkname', 'recordid'])
        );
      }

      break;
    }

    case 'SHEET_COLUMN_TYPE_CHOICE':
    case 'SHEET_COLUMN_TYPE_SCORE': {
      const choices = element.choices?.choice;

      if (choices) {
        return asArray(choices).map((choice: any) => ({
          label: choice.label
        }));
      }

      break;
    }

    case 'SHEET_COLUMN_TYPE_ATTACHMENT': {
      const attachments = element.attachments?.attachment;

      if (attachments) {
        return asArray(attachments).map((attachment: any) => ({
          apiurl: attachment?.apiurl,
          attachmentname: attachment?.attachmentname,
          attachmentextension:
            attachment?.attachmentextension ??
            attachment?.attachmentnxtension,
          id: attachment?.id
        }));
      }

      break;
    }

    case 'SHEET_COLUMN_TYPE_JOIN': {
      const joinCondition = element.isheetitem;
      if (joinCondition) return joinCondition;
      break;
    }

    case 'SHEET_COLUMN_TYPE_ISHEET_LINK': {
      const iSheetLink = element.isheetitems?.isheetitem;
      if (iSheetLink) return iSheetLink;
      break;
    }

    case 'SHEET_COLUMN_TYPE_DOCUMENT_LINK': {
      const fileLink = element.documents?.document;
      if (fileLink) return fileLink;
      break;
    }

    case 'SHEET_COLUMN_TYPE_HYPERLINK':
      return element;

    case 'SHEET_COLUMN_TYPE_IMAGE':
      return element.apiurl || '';

    case 'SHEET_COLUMN_TYPE_FOLDER_LINK': {
      const folder = element.folders?.folder;

      if (folder) {
        return extractData(
          folder,
          ['folderid', 'httplink', 'foldername']
        );
      }

      break;
    }

    default: {
      if (element.isheetitems?.isheetitem) {
        return asArray(element.isheetitems.isheetitem).map((linked: any) =>
          extractData(linked, ['linkname', 'recordid'])
        );
      }

      if (element.value !== undefined && element.value !== null) {
        return element.value;
      }
    }
  }

  return '';
}

/**
 * Fetches and normalizes iSheet rows.
 *
 * If `viewId` is omitted, no `sheetviewid` query parameter is sent.
 */
export async function fetchIsheetData(
  sheetId: string | number,
  options: FetchIsheetOptions = {}
): Promise<FetchIsheetResult> {
  const {
    viewId,
    limit = 1000,
    offset = 0,
    apiBaseUrl = HighQConfig.getBaseUrl()
  } = options;

  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  if (viewId != null && String(viewId) !== '') {
    params.set('sheetviewid', String(viewId));
  }

  const url =
    `${apiBaseUrl}/isheet/${sheetId}/items?${params.toString()}`;

  const response = await fetch(url, {
    headers: { accept: 'application/json' }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Error al obtener datos del iSheet: ` +
      `${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`
    );
  }

  const data: any = await response.json();

  const rawHead = data?.isheet?.head?.headcolumn;
  const rawBody = data?.isheet?.data?.item;

  const head = asArray(rawHead);
  const body = asArray(rawBody);

  const columns: ColumnMap = {};

  for (const column of head) {
    const originalName = String(column?.columnvalue ?? '');
    if (!originalName) continue;

    columns[originalName] = {
      id: String(column?.columnid ?? ''),
      type: String(column?.columntypealias ?? ''),
      columntypeid: String(column?.columntypeid ?? ''),
      originalName,
      normalizedName: normalizeColumnName(originalName)
    };
  }

  const newNames: Record<string, string> = {
    userdisplayname: 'name',
    apiurl: 'userID'
  };

  const rows: IsheetRow[] = body.map((item: any) => {
    const entry: IsheetRow = {
      itemID: String(item?.itemid ?? '')
    };

    for (const [columnName, def] of Object.entries(columns)) {
      entry[def.normalizedName] = getColumnValue(
        item,
        def.id,
        def.type,
        newNames
      );
    }

    return entry;
  });

  return { rows, columns };
}
