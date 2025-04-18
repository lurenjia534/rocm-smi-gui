use serde::{Deserialize, Serialize};
use std::{path::PathBuf, process::Stdio};
use which::which;
use tokio::process::Command;


#[derive(Deserialize, Debug,Serialize)]
pub struct RocmVersion {
    #[serde(rename = "ROCM-SMI version")]
    pub rocm_smi: String,
    #[serde(rename = "ROCM-SMI-LIB version")]
    pub rocm_smi_lib: String,
}

#[derive(Deserialize, Debug, Serialize)]
pub struct RocmCheckResult {
    // rocm-smi 实际路径(若存在)
    pub path: Option<PathBuf>,
    // 版本信息（可能为空，取决于是否能运行 CLI）
    pub version: Option<RocmVersion>,
}

/// 在PATH中查找 rocm-smi
fn locate_rocm_smi() -> Option<PathBuf> {
 which("rocm-smi").ok()
}

/// 调用 'rocm-sim --version --josn' 命令 并解析
async fn query_rocm_version(path: &PathBuf) -> anyhow::Result<RocmVersion> {
    let output = Command::new(path)
        .args(["--version", "--json"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .await?;
    Ok(serde_json::from_slice::<RocmVersion>(&output.stdout)?)
}

/// tauri 命令：返回路径和版本信息
#[tauri::command]
pub async fn check_rocm_smi() -> RocmCheckResult {
    let path = locate_rocm_smi();
    let version = if let Some(ref p) = path {
        query_rocm_version(p).await.ok()
    } else {
        None
    };
    RocmCheckResult { path, version }
}