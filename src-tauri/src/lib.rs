// IMPORTS
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

// The server the webview shows, empty until the connect page picked one
#[derive(Clone, Default)]
struct Server(Arc<Mutex<Option<Url>>>);

// ==================================================================================================================================

// SERVER FILE | one line in the app's config folder, survives updates, gone with the app data
fn server_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join("server.txt"))
}

// Bare hosts get https, anything that is no web address is refused
fn parse_server(input: &str) -> Result<Url, String> {
    let input = input.trim();
    let with_scheme = if input.contains("://") { input.to_string() } else { format!("https://{input}") };
    let url = Url::parse(&with_scheme).map_err(|_| "Not a valid address".to_string())?;
    match url.scheme() {
        "http" | "https" if url.host_str().is_some() => Ok(url),
        _ => Err("Use an http or https address".to_string()),
    }
}

// The bundled connect page, http://tauri.localhost on Android and Windows, tauri://localhost elsewhere
fn is_local(url: &Url) -> bool {
    url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost")
}

// ==================================================================================================================================

// COMMANDS | called by the connect page

#[tauri::command]
fn saved_server(app: AppHandle) -> Option<String> {
    let file = server_file(&app)?;
    fs::read_to_string(file).ok().map(|text| text.trim().to_string()).filter(|text| !text.is_empty())
}

#[tauri::command]
fn connect(app: AppHandle, server: State<Server>, url: String) -> Result<String, String> {
    let url = parse_server(&url)?;

    // REMEMBER IT | a failed write only costs asking again next start
    if let Some(file) = server_file(&app) {
        let _ = file.parent().map(fs::create_dir_all);
        let _ = fs::write(file, url.as_str());
    }
    *server.0.lock().unwrap() = Some(url.clone());

    // OPEN IT
    let window = app.get_webview_window("main").ok_or("No window")?;
    window.navigate(url.clone()).map_err(|error| error.to_string())?;
    Ok(url.to_string())
}

// ==================================================================================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let server = Server::default();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(server.clone())
        .invoke_handler(tauri::generate_handler![saved_server, connect])
        .setup(move |app| {
            let handle = app.handle().clone();

            // MAIN WINDOW | starts on the connect page, which moves on to the server by itself once it answers
            // Links leaving the app and the server open in the system browser instead of replacing the app
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Notifica Ex")
                .on_navigation(move |url| {
                    let on_server = server.0.lock().unwrap().as_ref().is_some_and(|s| s.origin() == url.origin());
                    if is_local(url) || on_server || url.scheme() == "about" {
                        return true;
                    }
                    if matches!(url.scheme(), "http" | "https" | "mailto" | "tel") {
                        let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                    }
                    false
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
