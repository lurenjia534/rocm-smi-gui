// Prevents an additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod rocm;
use crate::rocm::{check_rocm_smi, query_snapshot};
use tauri::Emitter;
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![check_rocm_smi])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    if let Ok(gpus) = query_snapshot().await {
                        let _ = handle.emit("gpu-update", &gpus);
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run app");
}