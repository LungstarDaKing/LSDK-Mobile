Update from v0.12.0 to 64d0d5b
1. Extract this zip over your LSDKMobile folder (allow overwrite).
2. Delete every file listed in REMOVED.txt (if it is empty, nothing to delete).
3. package.json changed: run  npm ci
4. app.json changed: delete the ios/ and android/ folders if you have them (they are regenerated), and make a new dev build.
