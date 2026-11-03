fn main() {

    // APP COMMANDS | listed so capabilities can grant them by name
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["saved_server", "connect"])),
    )
    .expect("failed to run tauri build script");
}
