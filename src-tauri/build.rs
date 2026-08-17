fn main() {
  if std::env::var_os("CARGO_FEATURE_TAURI_TEST").is_some() {
    napi_build::setup();
  }
  tauri_build::build();
}
