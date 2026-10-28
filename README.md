# Sarah's Stitched Gifts Studio | Version 3.1 (development only)

**No app was deployed, no Dropbox account was connected, and no GitHub repository was modified.**

## Version 3.1 authentication changes

- The OAuth PKCE redirect URI is explicitly pinned to `https://sarahbacay-ui.github.io/sarahs-stitched-gifts-studio/`, including the final slash.
- Dropbox login refuses to start on a different address (including local `file://` previews), avoiding redirect mismatches.
- The same address is checked when processing an OAuth callback.
- The public Dropbox App key is **not included** because it has not been provided. The existing Backup & Sync page lets the owner enter it on their device when ready. **Never enter the App secret.**
- The approved dashboard's markup and stylesheet are unchanged from V3.

## Before a future login test

1. Review and approve a separate deployment. This ZIP has not been uploaded to GitHub.
2. Ensure the hosted URL exactly matches the registered Dropbox OAuth redirect URI.
3. Open Backup & Sync and enter the Dropbox **App key** (public identifier only).
4. Export a local JSON backup before testing synchronization.
5. Connect Dropbox only after explicit authorization.

## Known limitations

- Manual whole-database synchronization only; no automatic sync or per-record conflict resolution.
- Backups are generated on uploads, not on a schedule.
- Short-lived Dropbox access token stored in sessionStorage; reconnecting may be required.
- The current Dropbox sync UI can replace an entire local or remote snapshot **after confirmation**. Do not use with important live data until granular conflict resolution is implemented.
- No live Dropbox OAuth or iPhone/iPad testing has occurred.
- Backup data in Dropbox is not end-to-end encrypted by the app.

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
