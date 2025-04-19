use app_lib::rocm::{classify_gpu, query_snapshot, GpuKind, RocmDevice}; // 包名若是 app 改成 app::

/// 单元测试离线 JSON 解析 & 分类
#[test]
fn parse_offline_sample() {
    // 读取固定样本
    let data = include_str!("fixtures/sample.json");
    let snapshot = serde_json::from_str::<serde_json::Value>(data).unwrap();
    let cards = snapshot.as_object().unwrap();

    let mut kinds = Vec::new();
    for (_, v) in cards {
        if v.is_object() {
            // let dev: app_lib::rocm::RocmDevice = serde_json::from_value(v.clone()).unwrap();
            let dev: RocmDevice = serde_json::from_value(v.clone()).unwrap();
            kinds.push(classify_gpu(&dev));
        }
    }

    // 断言至少有一张独显和一张核显
    assert!(kinds.contains(&GpuKind::Discrete), "未检测到独显");
    assert!(kinds.contains(&GpuKind::Integrated), "未检测到核显");
}

/// 真机调用 query_snapshot（可选，跑 CI 时可 `#[ignore]`）
#[tokio::test(flavor = "current_thread")]
#[ignore] // 取消此行即可在有 ROCm 环境时运行
async fn live_snapshot_has_devices() {
    let gpus = query_snapshot().await.expect("query_snapshot 失败");
    assert!(!gpus.is_empty(), "未检测到任何 GPU");
}
