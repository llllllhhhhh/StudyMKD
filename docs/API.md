# Keji local API

The backend listens on `127.0.0.1:8787` and is intentionally unavailable to other machines.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Readiness probe |
| `GET` | `/api/state` | Load the complete local application state |
| `PUT` | `/api/state` | Atomically persist the complete application state |
| `POST` | `/api/ocr/catalog` | OCR a multipart directory image (`file`) |

## Native attachment bridge (planned desktop integration)

The desktop host should expose attachment import with a user-selected mode:

- `linked`: retain the canonical absolute path and read the original file on demand.
- `managed`: copy files into the application data directory and retain the managed canonical path.

The bridge must return `name`, `relativePath`, `size`, `mime`, `storageMode`, and `nativePath`. A reveal action must accept only a previously issued attachment identifier, resolve its stored canonical path server-side, and call Windows Explorer without accepting an arbitrary command or client-supplied shell string.

Managed deletion must resolve the target from the stored project, chapter, and relative attachment path under the managed root. It may remove empty managed parent directories, but must never delete linked source files or user-selected export folders.

The frontend currently uses IndexedDB and browser-side OCR so it runs without the native toolchain. The API has the same state boundary intended for the desktop build; switching persistence only requires replacing `src/lib/storage.ts` and `src/lib/ocr.ts`.
