fn main() {
    #[cfg(target_os = "macos")]
    std::process::Command::new("pnpm")
        .args(&["build"])
        .status()
        .unwrap();

    let _target = std::env::var("TARGET").unwrap();

    #[cfg(windows)]
    if _target.contains("windows") {
        use std::fs;
        use std::path::{Path, PathBuf};

        // we're building for windows so we need the installer plugin
        let user_dir = std::env::var_os("USERPROFILE").map(PathBuf::from).unwrap();
        let appdata_dir = user_dir.join("AppData/Local/tauri/NSIS");

        let files = [
            (
                "gen/plugins/x86-ansi/INetC.dll",
                "Plugins/x86-ansi/INetC.dll",
            ),
            (
                "gen/plugins/x86-unicode/INetC.dll",
                "Plugins/x86-unicode/INetC.dll",
            ),
        ];

        for (src, dst) in files.iter() {
            let source = Path::new(src);
            fs::copy(source, appdata_dir.join(dst)).unwrap();
        }
    }

    tauri_build::build();
}
