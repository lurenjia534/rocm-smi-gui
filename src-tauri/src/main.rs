// Prevents an additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod rocm;
mod rocm_pid;
use crate::rocm::{check_rocm_smi, full_snapshot};
use tauri::Emitter;
use rocm_pid::{query_rocm_pids, list_rocm_pids};
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![check_rocm_smi, list_rocm_pids])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    // ① GPU 概况
                    if let Ok(gpus) = full_snapshot().await {
                        let _ = handle.emit("gpu-update", &gpus);
                    }
                    // ② GPU 进程
                    if let Ok(pids) = query_rocm_pids().await {
                        let _ = handle.emit("gpu-pids-update", &pids);
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run app");
}
