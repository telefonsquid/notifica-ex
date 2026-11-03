// No console window next to the app in desktop release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    notifica_ex_lib::run()
}
