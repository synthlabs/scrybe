use std::process::Command;

fn main() {
    #[cfg(target_os = "macos")]
    Command::new("pnpm").args(&["build"]).status().unwrap();

    tauri_build::build();
}
