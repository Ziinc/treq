fn main() {
  #[cfg(target_os = "macos")]
  println!("cargo:rustc-link-arg-bin=treq=-Wl,-rpath,@executable_path/../Frameworks");

  if std::env::var_os("CARGO_FEATURE_TAURI_TEST").is_some() {
    napi_build::setup();
  }
  tauri_build::build();
}
