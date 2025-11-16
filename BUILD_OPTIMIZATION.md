# Rust Build Optimization Guide

This document explains the build optimizations applied to Treq for faster development and smaller release binaries.

## Overview

We've implemented several Rust build optimizations:
- **Faster linker configuration** via `.cargo/config.toml`
- **Optimized compilation profiles** in `src-tauri/Cargo.toml`
- **Selective Tokio features** to reduce dependencies

## Expected Improvements

| Metric | Improvement |
|--------|-------------|
| Dev build time | 30-50% faster |
| Dev runtime performance | Noticeably faster |
| Release binary size | 20-40% smaller |
| Release build time | Slightly slower (due to LTO) but better output |

## Configuration Details

### 1. Faster Linker (`.cargo/config.toml`)

**What it does:**
- Uses platform-specific linkers that are faster than the default
- Reduces link time, which is often the longest part of compilation

**Platform support:**
- **macOS**: Configured for system linker (can upgrade to `zld` via `brew install zld`)
- **Linux**: Uses `lld` linker (install via package manager: `sudo apt install lld`)
- **Windows**: Optimized MSVC linker flags

### 2. Development Profile Optimizations

**Settings in `[profile.dev]`:**
- `opt-level = 1`: Light optimization for better runtime performance without significantly impacting compile time
- `debug = true`: Keeps debug symbols for debugging
- `incremental = true`: Faster rebuilds by reusing previous compilation results

**Settings in `[profile.dev.package."*"]`:**
- `opt-level = 2`: Dependencies compiled with higher optimization once
- `debug = false`: Removes debug symbols from dependencies (faster linking)

**Why this works:** Your code changes frequently but dependencies don't. Optimizing dependencies once gives you faster runtime during development without constantly recompiling them.

### 3. Release Profile Optimizations

**Settings in `[profile.release]`:**
- `opt-level = "z"`: Aggressive size optimization (use `"s"` if you prefer slightly faster code)
- `lto = "thin"`: Link Time Optimization for better dead code elimination and inlining
- `codegen-units = 1`: Single compilation unit allows maximum optimization
- `strip = true`: Removes debug symbols and other metadata from binary
- `panic = "abort"`: Simpler panic behavior reduces binary size

**Trade-off:** Release builds take longer but produce much smaller, faster binaries.

### 4. Tokio Feature Optimization

**Before:**
```toml
tokio = { version = "1", features = ["full"] }
```

**After:**
```toml
tokio = { version = "1", features = ["rt-multi-thread", "macros", "io-util", "process", "fs", "sync"] }
```

**Benefits:**
- Faster compilation (only compiles what we use)
- Smaller binary size
- Same functionality for Treq's needs

**Features explained:**
- `rt-multi-thread`: Multi-threaded async runtime (needed for Tauri)
- `macros`: `#[tokio::main]` and other macros
- `io-util`: Async I/O utilities
- `process`: Async process spawning (for PTY)
- `fs`: Async file system operations
- `sync`: Async synchronization primitives

## Benchmarking Build Times

To measure the impact of these optimizations:

### Clean Build Benchmark

```bash
# Benchmark dev build
cargo clean
time cargo build --manifest-path=src-tauri/Cargo.toml

# Benchmark release build
cargo clean
time cargo build --release --manifest-path=src-tauri/Cargo.toml
```

### Incremental Build Benchmark

```bash
# Make a small change to src-tauri/src/lib.rs
echo "// test" >> src-tauri/src/lib.rs

# Benchmark incremental dev build
time cargo build --manifest-path=src-tauri/Cargo.toml

# Revert the change
git checkout src-tauri/src/lib.rs
```

### Binary Size Comparison

```bash
# Check release binary size (macOS)
ls -lh src-tauri/target/release/treq

# Check with optimization stats
cargo bloat --release --manifest-path=src-tauri/Cargo.toml
```

## Tuning for Your System

### Use Faster Linker on macOS

Install `zld` (faster than system linker):
```bash
brew install zld
```

Then update `.cargo/config.toml`:
```toml
[target.x86_64-apple-darwin]
rustflags = ["-C", "link-arg=-fuse-ld=zld"]

[target.aarch64-apple-darwin]
rustflags = ["-C", "link-arg=-fuse-ld=zld"]
```

### Adjust Parallel Jobs

If you have a powerful machine with many cores:
```toml
# Add to .cargo/config.toml
[build]
jobs = 16  # Adjust based on your CPU cores
```

### Balance Size vs Speed in Release

If you prefer faster runtime over smaller size:
```toml
# In src-tauri/Cargo.toml
[profile.release]
opt-level = "3"    # Change from "z" to "3"
```

## Troubleshooting

### Build Errors After Changes

If you encounter build errors:
1. Clean the build cache: `cargo clean`
2. Rebuild: `cargo build`

### Linker Not Found (Linux)

Install required linker:
```bash
# Debian/Ubuntu
sudo apt install lld

# Fedora
sudo dnf install lld

# Arch
sudo pacman -S lld
```

### Performance Issues in Dev Mode

If `opt-level = 1` is too slow at runtime:
```toml
# Increase to opt-level = 2 in [profile.dev]
opt-level = 2
```

## Additional Resources

- [Cargo Profile Documentation](https://doc.rust-lang.org/cargo/reference/profiles.html)
- [The Rust Performance Book](https://nnethercote.github.io/perf-book/)
- [Fast Rust Builds](https://matklad.github.io/2021/09/04/fast-rust-builds.html)

## Verification

After applying these optimizations, verify everything works:

```bash
# Test dev build
npm run tauri dev

# Test release build
npm run tauri build
```

Monitor build times and binary sizes to confirm the improvements.

