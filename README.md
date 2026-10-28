# Sarah’s Stitched Gifts Studio | Dropbox integration milestone v3

This is a **development build** based on v2. No accounts were created, no Dropbox connection was made, and the approved dashboard layout was not intentionally modified.

## Implemented
- Dropbox OAuth 2 authorization-code flow with PKCE, initiated by a user click.
- App Folder-scoped Dropbox file access (configure `files.content.read` and `files.content.write`).
- Manual upload/download of a complete, checksummed snapshot.
- Remote revision-conditional writes to reduce accidental overwrites.
- Versioned backup files on successful upload.
- Explicit first-sync and conflict choices, never silent remote replacement.
- Local IndexedDB remains the offline working database.

## Not yet production-ready
- **Automatic sync and scheduled backups are not implemented.** This milestone provides manual sync and backup on upload only.
- Conflicts are resolved at **whole-database level**, not per-counter, note, or inventory record. This is not the final approved conflict behavior.
- OAuth uses a short-lived access token kept only in sessionStorage. Reconnection may be needed. Do not store an app secret in the browser.
- Dropbox App Folder, API scopes, app key, and redirect URI must be configured in a Dropbox developer account by the user in a later approved step.
- This implementation has not been integration-tested against live Dropbox or physical devices.
- Dropbox backups contain unencrypted personal project data. No retention/pruning, encryption, automatic recovery, or full revision history yet.
- The previous prototype limitations still apply, including 5 MB pattern imports and incomplete pattern viewing.

## Setup when approved for testing
1. Host the app on an HTTPS origin (not done).
2. Create a Dropbox API app with **App Folder** access and permissions `files.content.read` and `files.content.write`.
3. Register the exact hosted URL as an OAuth redirect URI.
4. Open Backup & Sync, enter the Dropbox **public App Key** (not secret), and click Connect Dropbox.
5. Export a local JSON backup before first sync.
6. Use Sync now and carefully review any conflict prompts.

This milestone should not be used as the only copy of valuable work.
