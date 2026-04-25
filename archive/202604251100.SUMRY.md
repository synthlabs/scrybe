[commit]: # '906bc484d0cd52150d9bff353d9bd2083bf66403'

Features:

- (ui): update colors and add splash page build hook
- (settings): preset selector for models
- (build): move dep management into a central script

Fixes:

- (build): dont double build front end
- (audio): properly fallback to default audio device
- (ui:settings): properly save setting changes
- (overlay): properly serve the embeded files for svelte to work

Misc:

- (build): fix misc pnpm check errors
- (build): migrate to use shared utils/js
- (build): migrate to use shared utils/scripts
- (build): add gen_bindings command
- (deps): update deps
- (build): version bump
