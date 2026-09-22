# HighQ Tools

Reconstructed version of the HighQ browser SDK developed in the conversation.

## Install dependencies

```bash
npm install
```

## Build

```bash
npm run build
```

The browser bundle is generated at:

```text
dist/highq-tools.iife.js
```

When loaded in a browser it exposes:

```js
window.HighQTools
```

## Configure the HighQ API base URL

```js
HighQTools.config.setBaseUrl(
  "https://your-highq-host/your-instance/api/3"
);
```

If no override is set, the fallback is:

```text
window.location.origin + /api/3
```

## Main APIs

```js
await HighQTools.fetchIsheetData(isheetId, options);

await HighQTools.saveNewItem(isheetId, item, schema, options);

await HighQTools.updateItem(isheetId, itemId, item, schema, options);

await HighQTools.uploadAttachment(isheetId, {
  file,
  filename: file.name
});

await HighQTools.attachAttachmentToItem(
  isheetId,
  itemId,
  columnId,
  attachmentId
);

const superSheet = await HighQTools.getRelated(
  {
    empresas: 123,
    empleados: 456
  },
  {
    relations: [
      {
        from: "empleados",
        column: "empresa",
        to: "empresas",
        many: false
      }
    ]
  }
);

await HighQTools.uploadChanges(superSheet, {
  schemas: {
    empleados: {
      nombre: { colId: "123456", type: "text" }
    }
  }
});
```

## Loading a bundle stored in HighQ Documents

Some HighQ file-content endpoints return JavaScript as `application/octet-stream`,
which can be rejected by strict MIME checking in a normal `<script src>`.

The test page in `examples/highq-test.html` uses the working pattern:

1. `fetch()` the file content.
2. Read it with `response.text()`.
3. Inject it into an inline `<script>`.

## Current limitations

- Writing supports `text`, `choice`, and `hyperlink`.
- Choice labels can be resolved automatically to HighQ choice IDs.
- `getRelated()` expands configured relations in memory.
- `uploadChanges()` should currently use schemas containing writable fields only.
  Expanded lookup fields are not yet serialized back as lookup columns.
- Automated tests are not implemented yet.
