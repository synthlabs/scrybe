use std::process::Command;

fn main() {
    // Tauri CLI runs `pnpm build` via `beforeBuildCommand` and sets TAURI_ENV_*
    // before invoking cargo. Only build the frontend ourselves for plain `cargo build`.
    if std::env::var_os("TAURI_ENV_PLATFORM").is_none() {
        let pnpm = if cfg!(target_os = "windows") { "pnpm.cmd" } else { "pnpm" };
        Command::new(pnpm).args(&["build"]).status().unwrap();
    }

    tauri_build::build();
}
