use std::process::Command;

fn main() {
    Command::new("pnpm").args(&["build"]).status().unwrap();

    tauri_build::build();
}
