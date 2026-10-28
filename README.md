# Sarah’s Stitched Gifts Studio, Version 3.2 (development build)

This is a local build only. Nothing has been uploaded to GitHub or connected to Dropbox.

## Changes
- Header uses a crop of the exact uploaded terracotta yarn ball and knitting-needles image.
- Welcome banner uses a photograph crop from the same approved reference; the text is separate, so it remains legible.
- Change photo, reposition and restore approved banner controls. Photos saved locally in the browser, not yet synced to Dropbox.
- Edit Layout enables drag-to-reorder and touch-friendly up/down controls. Widgets snap to existing grid positions. Order saved in local browser storage.
- Original layout order restored using Reset layout.
- No Dropbox account connection or deployment performed.

## Limitations
- The original uploaded artwork is a single flattened image with text; the logo and photo are cropped from it. The logo crop may show background color. Exact isolated artwork requires a separate transparent logo or photo asset.
- Banner photo settings and widget order currently save per browser/device; they are not yet part of Dropbox sync or backup.
- Touch reorder uses up/down buttons as a reliable alternative to drag-and-drop on iOS.
- Dropbox manual sync and the earlier Version 3.1 functionality remain experimental.

## Review before deployment
Unzip and review the files. Upload to GitHub only after approving this development build. The live website is unchanged.


## Gift Planner calendar update
- Calendar shows only gifts with a due date; gifts without deadlines remain in All planned gifts.
- Month navigation, date selection, gift editing and removal are available.
- Dates and gifts are saved with existing IndexedDB app data.
- Reminders are recorded as dates, but automatic notification delivery is not implemented.
- No changes were made to the live GitHub Pages website or repository.


## Version 3.3 mobile navigation
On iPhone-width screens, the bottom bar is Home, Projects, Yarn, More. More opens the remaining app sections, including Gift Planner, Ideas & Requests, Tools, Patterns, Stitch Counters, Completed, Backup & Sync, and Settings. The iPad/desktop sidebar is unchanged. The service worker cache is versioned to refresh updated files.
