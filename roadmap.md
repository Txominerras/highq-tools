# HighQ Tools — Roadmap

## 0. Project foundation
- [x] TypeScript project
- [x] npm
- [x] Rollup
- [x] ESM bundle
- [x] CJS bundle
- [x] IIFE browser bundle (`window.HighQTools`)

## 1. Core
- [x] Environment helpers
- [x] Global API base URL configuration
- [x] Manual `setBaseUrl()`
- [x] Automatic base URL fallback
- [x] HTTP helpers
- [ ] Advanced typed HighQ errors
- [ ] Debug/logger mode

## 2. iSheet reads
- [x] `fetchIsheetData()`
- [x] Optional `viewId`
- [x] Pagination parameters (`limit`, `offset`)
- [x] Return `{ rows, columns }`
- [x] Parse lookup users
- [x] Parse choices / scores
- [x] Parse attachments
- [x] Parse joins
- [x] Parse iSheet links
- [x] Parse document links
- [x] Parse hyperlinks
- [x] Parse images
- [x] Parse folder links
- [ ] Automatic pagination beyond a single request
- [ ] Select only requested columns
- [ ] Raw-response mode

## 3. iSheet writes
- [x] `saveNewItem()`
- [x] `updateItem()`
- [x] JSON -> HighQ XML
- [x] Text columns
- [x] Choice columns
- [x] Hyperlink columns
- [x] Optional date column
- [x] `onlyKeys`
- [x] Choice label -> choice ID resolution
- [x] Choice metadata cache
- [ ] Lookup write support
- [ ] Multi-choice write support
- [ ] User lookup write support
- [ ] Document-link write support
- [ ] Folder-link write support
- [ ] Bulk create/update

## 4. Attachments
- [x] `buildAttachmentFormData()`
- [x] `uploadAttachment()`
- [x] Progressive-key polling
- [x] Return attachment ID
- [x] `attachAttachmentToItem()`
- [x] Preserve existing attachment IDs
- [x] `extractAttachmentIds()`
- [ ] High-level `uploadAndAttach()` helper
- [ ] Remove attachment helper

## 5. Related iSheets
- [x] `getRelated()`
- [x] Fetch multiple iSheets in parallel
- [x] Declarative relations
- [x] Resolve one-to-one relations
- [x] Resolve one-to-many relations
- [x] Preserve original row snapshot in `__meta`
- [x] Preserve each sheet's column metadata
- [x] `uploadChanges()`
- [x] Detect modified writable fields
- [ ] Automatic relationship discovery
- [ ] Reverse relationships
- [ ] Nested recursive expansion
- [ ] Lookup serialization when uploading changes
- [ ] Conflict handling / optimistic locking
- [ ] Transaction-like change report

## 6. iSheet administration
- [ ] Create an iSheet from JSON
- [ ] Create columns from schema
- [ ] Reusable iSheet templates
- [ ] Clone iSheet configuration
- [ ] Views helpers

## 7. UI / HighQ helpers
- [ ] Open native create-item popup
- [ ] Filter visible popup fields
- [ ] Prefill popup values
- [ ] Prefill lookup relationships
- [ ] Reusable table widgets
- [ ] Chart widgets
- [ ] Hooks/events

## 8. Developer experience
- [ ] Automated unit tests
- [ ] HighQ integration test site
- [ ] Typed schemas for more HighQ column types
- [ ] API reference generation
- [ ] Better runtime validation
- [ ] Changelog / semantic versioning
