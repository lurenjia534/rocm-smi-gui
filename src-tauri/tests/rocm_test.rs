use app_lib::rocm::check_rocm_smi;

#[tokio::test(flavor = "current_thread")]
async fn rocm_cli_returns_path_and_version() {
    let res = check_rocm_smi().await;
    assert!(res.path.is_some(), "未找到 rocm-smi，可检查 PATH 或安装位置");

    let ver = res.version.expect("无法解析版本，请确认 rocm-smi --json 输出格式");

    assert!(
        !ver.rocm_smi.is_empty() && !ver.rocm_smi_lib.is_empty(),
        "版本字段为空"
    );
}