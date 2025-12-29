[commit]: # 'b9bcaddddff7eaf3b37d34188449056bc04ef41b'

Features:

- (audio): use the selected audio device when recording for the transcript
- (ui:audio): implement get devices on the backend
- (ui:audio): get audio devices from the backend
- (core): save app state on disk
- (updater): add basic update hook
- (build): setup release and auto updating

Fixes:

- (core): fix bug in update state refactor
- (core): properly update model path in the app state
- (build): include more dlls
- (build): include cuda dlls in windows installer (#5)
- (build): update actions (#4)
- (build): update actions mac version
- (build): add build env files back to repo
- (build): windows cuda builds (#2)
- (deps): fix dep version mismatch
- (build): update actions to properly tag things
- (build:gh): fix typo
- (style): update logo
- (build): remove old dep
- (build): actually only run windows steps on windows
- (build): update actions and install windows deps
- (build): update tauri signing env var names
- (build): install alsa system dep on ubuntu

Misc:

- (deps): update deps
- Update publish-release.yml- (deps): update deps
- (core): use the new synced state snapshot api
- (core): move to tauri synced state for state management
- (core): setup foundation to use synced state lib
- (ui): switch to shared logger
- (core): migrate from rs-ts to specta for type handling
- (whisper): update to whisper 15
- (deps): update deps
- (core): refresh code base
- (cli): basic skeleton cli for testing device manager
- (deps): update deps
- update deps
- (deps): update deps
