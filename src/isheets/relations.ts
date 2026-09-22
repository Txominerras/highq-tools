import {
  fetchIsheetData,
  FetchIsheetOptions,
  IsheetRow,
  ColumnMap
} from './fetch';

import {
  saveNewItem,
  updateItem,
  IsheetSchema,
  ItemData
} from './items';

export interface RelationConfig {
  /**
   * Key of the sheet containing the reference.
   */
  from: string;

  /**
   * Normalized row property containing the lookup/link value.
   */
  column: string;

  /**
   * Key of the target sheet.
   */
  to: string;

  /**
   * If true, keep an array of related rows.
   */
  many?: boolean;

  /**
   * Preferred ID field inside the reference object.
   * Defaults to `recordid`, with fallbacks to itemID/id.
   */
  idField?: string;
}

export interface RelatedSheet {
  id: string | number;
  rows: RelatedRow[];
  columns: ColumnMap;
}

export interface RelatedRow extends IsheetRow {
  __meta: {
    sheetKey: string;
    original: IsheetRow;
  };

  [key: string]: any;
}

export interface SuperSheet {
  sheets: Record<string, RelatedSheet>;
}

export interface GetRelatedOptions {
  fetchOptions?: FetchIsheetOptions;
  relations?: RelationConfig[];
}

function cloneRow<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Fetches multiple iSheets and expands explicitly configured relationships.
 *
 * Example:
 *
 * getRelated(
 *   { empresas: 1, empleados: 2 },
 *   {
 *     relations: [
 *       { from: 'empleados', column: 'empresa', to: 'empresas' }
 *     ]
 *   }
 * )
 */
export async function getRelated(
  sheets: Record<string, string | number>,
  {
    fetchOptions,
    relations = []
  }: GetRelatedOptions = {}
): Promise<SuperSheet> {
  const entries = Object.entries(sheets);

  const data = await Promise.all(
    entries.map(async ([key, id]) => {
      const res = await fetchIsheetData(id, fetchOptions);

      const rows: RelatedRow[] = res.rows.map(row => ({
        ...row,
        __meta: {
          sheetKey: key,
          original: cloneRow(row)
        }
      }));

      const sheet: RelatedSheet = {
        id,
        rows,
        columns: res.columns
      };

      return [key, sheet] as const;
    })
  );

  const sheetMap: Record<string, RelatedSheet> =
    Object.fromEntries(data);

  const indexes: Record<string, Map<string, RelatedRow>> = {};

  for (const [key, sheet] of data) {
    indexes[key] = new Map(
      sheet.rows
        .filter(row => row.itemID != null && row.itemID !== '')
        .map(row => [String(row.itemID), row])
    );
  }

  for (const relation of relations) {
    const fromSheet = sheetMap[relation.from];
    const toIndex = indexes[relation.to];

    if (!fromSheet || !toIndex) continue;

    for (const row of fromSheet.rows) {
      const rawValue = row[relation.column];
      if (rawValue == null || rawValue === '') continue;

      const values = Array.isArray(rawValue)
        ? rawValue
        : [rawValue];

      const resolved = values
        .map(value => {
          if (value == null) return null;

          const preferredIdField =
            relation.idField || 'recordid';

          const refId =
            (
              typeof value === 'object'
                ? value?.[preferredIdField]
                : null
            ) ??
            (
              typeof value === 'object'
                ? value?.recordid
                : null
            ) ??
            (
              typeof value === 'object'
                ? value?.itemID
                : null
            ) ??
            (
              typeof value === 'object'
                ? value?.id
                : null
            ) ??
            (
              typeof value === 'string' ||
              typeof value === 'number'
                ? value
                : null
            );

          if (refId == null || refId === '') return null;

          return toIndex.get(String(refId)) || null;
        })
        .filter((value): value is RelatedRow => Boolean(value));

      row[relation.column] = relation.many
        ? resolved
        : resolved[0] ?? null;
    }
  }

  return {
    sheets: sheetMap
  };
}

export interface UploadChangesOptions {
  schemas: Record<string, IsheetSchema>;
}

function valuesEqual(before: any, after: any): boolean {
  try {
    return JSON.stringify(before) === JSON.stringify(after);
  } catch {
    return Object.is(before, after);
  }
}

/**
 * Persists writable changes from a SuperSheet.
 *
 * Important:
 * - The schema for each sheet should currently contain only fields supported
 *   by the write layer (`text`, `choice`, `hyperlink`).
 * - Expanded lookup/relation fields should be omitted until lookup writes are
 *   implemented.
 */
export async function uploadChanges(
  superSheet: SuperSheet,
  { schemas }: UploadChangesOptions
): Promise<void> {
  for (const [sheetKey, sheet] of Object.entries(
    superSheet.sheets
  )) {
    const schema = schemas[sheetKey];

    if (!schema) {
      throw new Error(
        `No hay schema para el sheet "${sheetKey}"`
      );
    }

    for (const row of sheet.rows) {
      const isNew = !row.itemID;

      if (isNew) {
        const payload: ItemData = {};

        for (const fieldKey of Object.keys(schema)) {
          payload[fieldKey] = row[fieldKey] as any;
        }

        await saveNewItem(
          sheet.id,
          payload,
          schema
        );

        continue;
      }

      const original = row.__meta?.original || {};
      const changedPayload: ItemData = {};

      for (const fieldKey of Object.keys(schema)) {
        const before = (original as any)[fieldKey];
        const after = row[fieldKey];

        if (!valuesEqual(before, after)) {
          changedPayload[fieldKey] = after as any;
        }
      }

      const changedKeys = Object.keys(changedPayload);

      if (!changedKeys.length) {
        continue;
      }

      await updateItem(
        sheet.id,
        row.itemID,
        changedPayload,
        schema,
        {
          onlyKeys: changedKeys
        }
      );

      // Keep the in-memory snapshot in sync so a second call does not upload
      // the same changes again.
      for (const key of changedKeys) {
        row.__meta.original[key] = cloneRow(row[key]);
      }
    }
  }
}
