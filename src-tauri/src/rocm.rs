use serde::{Deserialize, Deserializer, Serialize};
use std::{path::PathBuf, process::Stdio, str::FromStr};
use serde_json::Value;
use tokio::process::Command;
use which::which;

#[derive(Deserialize, Debug, Serialize)]
pub struct RocmVersion {
    #[serde(rename = "ROCM-SMI version")]
    pub rocm_smi: String,
    #[serde(rename = "ROCM-SMI-LIB version")]
    pub rocm_smi_lib: String,
}

fn de_f64<'de, D>(d: D) -> Result<Option<f64>, D::Error>
where
    D: Deserializer<'de>,
{
    let v: Option<serde_json::Value> = Option::deserialize(d)?;
    Ok(match v {
        Some(serde_json::Value::Number(n)) => n.as_f64(),
        Some(serde_json::Value::String(s)) => f64::from_str(&s).ok(),
        _ => None,
    })
}

fn de_u32<'de, D>(d: D) -> Result<Option<u32>, D::Error>
where
    D: Deserializer<'de>,
{
    let v: Option<serde_json::Value> = Option::deserialize(d)?;
    use serde_json::Value::*;
    Ok(match v {
        Some(Number(n)) => n.as_u64().map(|x| x as u32),
        Some(String(s)) => {
            let s = s.trim_matches(|c| c == '(' || c == ')' || c == 'M' || c == 'm' || c == 'h' || c == 'z');
            u32::from_str(&s).ok()
        }
        _ => None,
    })
}

/// 独显 / 核显 分类
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Hash)]
pub enum GpuKind {
    Discrete,
    Integrated,
    Unknown,
}

/// 解析 rocm‑smi --json -a 每张卡的关键字段
#[derive(Debug, Serialize, Deserialize)]
pub struct RocmDevice {
    /* 型号信息 */
    #[serde(rename = "Device Name")]
    pub product: Option<String>,
    #[serde(rename = "Card Series")]
    pub card_series: Option<String>, // ← 补回
    #[serde(rename = "Subsystem ID")]
    pub subsystem: Option<String>,
    #[serde(rename = "Card Vendor")]
    pub vendor: Option<String>,
    #[serde(rename = "GFX Version")]
    pub gfx_version: Option<String>,

    /* 温度 */
    #[serde(rename = "Temperature (Sensor edge) (C)", deserialize_with = "de_f64", default)]
    pub temp_edge: Option<f64>,
    #[serde(
        rename = "Temperature (Sensor junction) (C)",
        deserialize_with = "de_f64",
        default
    )]
    pub temp_hotspot: Option<f64>,
    #[serde(
        rename = "Temperature (Sensor memory) (C)",
        deserialize_with = "de_f64",
        default
    )]
    pub temp_mem: Option<f64>,

    /* 频率 (新增) */
    #[serde(rename = "sclk clock speed:", deserialize_with = "de_u32", default)]
    pub sclk_mhz:  Option<u32>,
    #[serde(rename = "mclk clock speed:", deserialize_with = "de_u32", default)]
    pub mclk_mhz:  Option<u32>,

    /* 显存总量 / 已用 (新增，单位 MB)  (新增) */
    #[serde(default)] pub vram_total_mb: Option<u32>,
    #[serde(default)] pub vram_used_mb:  Option<u32>,

    /* 风扇 */
    #[serde(rename = "Fan RPM", deserialize_with = "de_u32", default)]
    pub fan_rpm: Option<u32>,

    /* 功耗 */
    #[serde(
        rename = "Max Graphics Package Power (W)",
        deserialize_with = "de_f64",
        default
    )]
    pub power_cap: Option<f64>, /* 新增：Max Graphics Package Power */

    #[serde(
        rename = "Average Graphics Package Power (W)",
        deserialize_with = "de_f64",
        default
    )]
    pub power_avg: Option<f64>,
    
    /* 利用率 */
    #[serde(rename = "GPU use (%)", deserialize_with = "de_u32", default)]
    pub gpu_util: Option<u32>,
    #[serde(rename = "GPU Memory Allocated (VRAM%)", deserialize_with = "de_u32", default)]
    pub vram_util: Option<u32>,

    #[serde(rename = "GPU memory vendor")]
    pub vram_vendor: Option<String>,

    /* 分类 */
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<GpuKind>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RocmSnapshot {
    #[serde(flatten)]
    pub cards: serde_json::Map<String, serde_json::Value>,
}

#[derive(Deserialize, Debug, Serialize)]
pub struct RocmCheckResult {
    // rocm-smi 实际路径(若存在)
    pub path: Option<PathBuf>,
    // 版本信息（可能为空，取决于是否能运行 CLI）
    pub version: Option<RocmVersion>,
}

pub fn classify_gpu(dev: &RocmDevice) -> GpuKind {
    let name = dev
        .product
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let series = dev
        .card_series
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();

    let igpu_keys = ["raphael", "phoenix", "rembrandt", "van gogh", "r7", "r9"];
    if igpu_keys
        .iter()
        .any(|k| name.contains(k) || series.contains(k))
    {
        return GpuKind::Integrated;
    }

    if dev.vram_vendor.is_some() || dev.power_avg.map_or(false, |p| p > 50.0) {
        return GpuKind::Discrete;
    }

    GpuKind::Unknown
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

pub async fn full_snapshot() -> anyhow::Result<Vec<RocmDevice>> {
    use tokio::try_join;
    let (base, clocks, mem, pcap) = try_join!(
    Command::new("rocm-smi").args(["-a", "--json"]).output(),
    Command::new("rocm-smi").args(["--showgpuclocks","--showclocks","--json"]).output(),
    Command::new("rocm-smi").args(["--showmeminfo","vram","--json"]).output(),
    Command::new("rocm-smi").args(["--showmaxpower","--json"]).output()
  )?;

    // 基线反序列化
    let mut root: serde_json::Map<String, serde_json::Value> =
        serde_json::from_slice(&base.stdout)?;

    // 把额外三段 JSON 依次 merge 到 root
    for extra in [&clocks.stdout, &mem.stdout, &pcap.stdout] {
        let map: serde_json::Map<String, serde_json::Value> = serde_json::from_slice(extra)?;
        for (k, v) in map {
            if let (Some(Value::Object(tgt)), Value::Object(src)) = (root.get_mut(&k), v) {
                tgt.extend(src);
            }
        }
    }

    // 转 RocmDevice + 额外计算
    let mut out = Vec::new();
    for (k, v) in root {
        if !k.starts_with("card") { continue; }
        let mut d: RocmDevice = serde_json::from_value(v.clone())?;

        // 显存 bytes → MB
        if let Some(total_b) = v["VRAM Total Memory (B)"].as_str().and_then(|s| s.parse::<u64>().ok()) {
            d.vram_total_mb = Some((total_b / 1_048_576) as u32);
        }
        if let Some(used_b) = v["VRAM Total Used Memory (B)"].as_str().and_then(|s| s.parse::<u64>().ok()) {
            d.vram_used_mb = Some((used_b / 1_048_576) as u32);
        }

        // 最大功耗
        d.power_cap = v["Max Graphics Package Power (W)"].as_str().and_then(|s| s.parse::<f64>().ok());

        d.kind = Some(classify_gpu(&d));
        out.push(d);
    }
    Ok(out)
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
