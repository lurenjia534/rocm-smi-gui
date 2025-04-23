// ---------- src/rocm_pid.rs ----------
//! 结构体与解析逻辑被**单独拆分**到此文件，专职映射 `rocm-smi --showpids[ details] --json` 的输出。
use anyhow::Result;
use std::process::Stdio;
use serde::{Deserialize, Serialize};
use tokio::process::Command;

/// 一条进程信息（形如 `"ollama, 1, 6352367616, 0, unknown"`）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RocmPidInfo {
    /// 进程号（来自 `PIDxxxxx`）
    pub pid: u32,
    /// 可执行文件名
    pub name: String,
    /// GPU 索引（多卡场景）
    pub gpu_index: u32,
    /// 显存占用（字节）
    pub vram_bytes: u64,
    /// GPU 引擎占用百分比
    pub engine_usage: u32,
    /// 状态字段（目前多为 "unknown"）
    pub state: String,
}

impl RocmPidInfo {
    /// 从 `(key, value)` 解析：
    /// * `key` 形如 `PID144763`
    /// * `value` 形如 `"ollama, 1, 6352367616, 0, unknown"`
    pub fn parse(key: &str, value: &str) -> Option<Self> {
        let pid: u32 = key.trim_start_matches("PID").parse().ok()?;
        let mut parts = value.split(',').map(|s| s.trim());
        Some(Self {
            pid,
            name:         parts.next()?.to_owned(),
            gpu_index:    parts.next()?.parse().ok()?,
            vram_bytes:   parts.next()?.parse().ok()?,
            engine_usage: parts.next()?.parse().unwrap_or(0),
            state:        parts.next().unwrap_or("unknown").to_owned(),
        })
    }
}

/// 根据完整 JSON 提取列表
pub fn parse_rocm_pid_json(root: &serde_json::Value) -> Vec<RocmPidInfo> {
    root.get("system")
        .and_then(|v| v.as_object())
        .map(|obj| {
            obj.iter()
                .filter_map(|(k, v)| v.as_str().and_then(|s| RocmPidInfo::parse(k, s)))
                .collect()
        })
        .unwrap_or_default()
}


/// 调用 rocm-smi 抓取进程列表
pub async fn query_rocm_pids() -> Result<Vec<RocmPidInfo>> {
    let out = Command::new("rocm-smi")
        .args(["--showpids", "--json"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .await?;
    let json: serde_json::Value = serde_json::from_slice(&out.stdout)?;
    Ok(parse_rocm_pid_json(&json))
}

/// 暴露给前端的 Tauri 命令：手动拉取一次
#[tauri::command]
pub async fn list_rocm_pids() -> Vec<RocmPidInfo> {
    query_rocm_pids().await.unwrap_or_default()
}