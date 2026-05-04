[commit]: # '8ebdc6d01ed8f6a5597419b899df0c72473e5b04'

Features:

- (ui): ability to toggle sections on right side rail
- (ui): add clear transcript button
- (audio): add audio processing information
- (subtitles): add subtitle processing stats
- (subtitles): reduce unnecessary text updates from backend
- (home): only scroll transcript area
- (logging): support proper logging setup

Fixes:

- (build): don&#39;t depend on cuda in linux
- (core): windows properly loads cuda features
- (subtitles): fixed an issue where segments fail to update if they fall too far behind
- (audio): properly use the default audio device
- (ui): update some more color references
- (home): update button coloring
- (settings): properly update and reset settings when clicking button
- (ui): update info popup styling to match new theme
- (ui): update color scheme to be more neutral
- (ui): properly load in the correct location on start
- (build): update github action

Misc:

- (audio): rework the audio module so it can be tested in isolation
- (ui): final refresh pass on the ui
- (home): new home page for active session
- (overlay): rebuild overlay page
- (settings): new settings page
- (core): update core ui with new shared components
- (updater): version bump 0.2.10
