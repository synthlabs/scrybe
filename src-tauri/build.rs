use std::process::Command;

use tauri_build::{Attributes, DefaultPermissionRule, InlinedPlugin};

fn main() {
    println!("cargo:rustc-check-cfg=cfg(internal_enabled)");
    println!("cargo:rerun-if-env-changed=ENABLE_INTERNAL");
    println!("cargo:rerun-if-changed=../internal/rust/mod.rs");

    let internal_enabled = std::env::var("ENABLE_INTERNAL").as_deref() == Ok("1");
    if internal_enabled && std::path::Path::new("../internal/rust/mod.rs").exists() {
        println!("cargo:rustc-cfg=internal_enabled");
    }

    // Tauri CLI runs `pnpm build` via `beforeBuildCommand` and sets TAURI_ENV_*
    // before invoking cargo. Only build the frontend ourselves for plain `cargo build`.
    if std::env::var_os("TAURI_ENV_PLATFORM").is_none() {
        let pnpm = if cfg!(target_os = "windows") {
            "pnpm.cmd"
        } else {
            "pnpm"
        };
        Command::new(pnpm).args(&["build"]).status().unwrap();
    }

    inbound_build::stamp();
    tauri_build::try_build(
        Attributes::new().plugin(
            "inbound",
            InlinedPlugin::new()
                .commands(inbound_build::COMMANDS)
                .default_permission(DefaultPermissionRule::AllowAllCommands),
        ),
    )
    .expect("failed to run tauri build");
}
