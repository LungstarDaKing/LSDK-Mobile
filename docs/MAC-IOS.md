# Building the iOS app on a Mac

## One-time prerequisites
1. Xcode from the Mac App Store (open it once, accept the licence, let it install components).
2. Node 20+ (nodejs.org). Check: `node -v`
3. Your Apple ID signed in at Xcode > Settings > Accounts.
4. Your Supabase URL + publishable key (same as the web app's `src/config.js`).

## Steps
```
unzip LSDKMobile.zip && cd LSDKMobile
cp .env.example .env        # edit it: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY
bash scripts/mac-build.sh
```
The script checks your tools, installs packages, runs typecheck and tests, generates the native iOS project
(`ios/`, git-ignored; always regenerated), runs `pod install`, and opens the workspace in Xcode.

In Xcode:
1. Open the **LSDKChat** target > **Signing & Capabilities**; tick "Automatically manage signing"; choose your Team.
2. If "bundle identifier unavailable" appears, change `ios.bundleIdentifier` in app.json to something unique (e.g. `com.yourname.lsdkchat`), then re-run the script.
3. Pick a simulator or your plugged-in iPhone (enable Developer Mode on the phone) and press Run.

## Signing limits
- Free Apple ID: installs on your own device, app expires after 7 days, max 3 apps.
- Paid Apple Developer Program ($99/yr): TestFlight, App Store, longer installs.

## Troubleshooting
- `pod install` fails: `sudo gem install cocoapods` or `brew install cocoapods`, then `cd ios && pod install --repo-update`.
- White/crash on launch: `.env` was missing when the app was built. Fix `.env`, then in Xcode Product > Clean Build Folder and Run.
- After changing app.json or adding native packages: re-run `bash scripts/mac-build.sh` (it uses `--clean`).
- Never edit files in `ios/`; changes are overwritten. Change app.json or config plugins instead.

## What this build contains (v0.9.0)
Everything in docs/PARITY.md, including calls (native WebRTC compiles in Xcode, no Expo Go limits), notifications, games, watch together, LUNEX.
- **Calls on iPhone** need a real device (the simulator has no camera/mic) and `EXPO_PUBLIC_TURN_URL` set in `.env` for different networks.
- **Push notifications** need the paid Apple Developer account (Push capability) and an APNs key uploaded to Expo (`npx eas-cli credentials`). A free Apple ID build runs, but without push.
- If Xcode shows a compile error in `react-native-webrtc`, copy the first red error and send it to me; the first fix to try is upgrading that package.
- Alternative with no Mac: `npx eas-cli build --profile production --platform ios` builds in the cloud (paid Apple account required).
