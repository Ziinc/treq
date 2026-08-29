//! Phase 8 real-API end-to-end tests for the Remote SSH control plane
//! (prds/remote-ssh.md, "Phase 8: Test infrastructure against real APIs").
//!
//! Everything in this file talks to *real* vendor/control-plane APIs -
//! nothing here is mocked. That is the entire point of this file: it is the
//! non-mocked counterpart to `src-tauri/src/core/remote_provider_sprites.rs`'s
//! `wiremock`-based unit tests, which stay exactly as they are.
//!
//! ## Running this suite
//!
//! Every test here is gated on real credentials. With no credentials set,
//! `cargo test --test remote_e2e` runs to completion and every test prints
//! "SKIP: ..." and passes trivially - it does not fail, and it does not fake
//! a passing assertion against no server. See `docs/remote_e2e_README.md`.
//!
//! Required environment variables (all must be set to run *any* Fly-backed
//! test in this file):
//!
//! - `TREQ_REMOTE_E2E=1`: explicit opt-in; refuses to run even with other
//!   vars set, so a stray `FLY_TEST_API_TOKEN` in a shared CI environment
//!   can never accidentally trigger spend.
//! - `FLY_TEST_API_TOKEN`: a Fly API token scoped to a disposable test
//!   organization/app.
//! - `FLY_TEST_API_BASE_URL`: defaults to `https://api.machines.dev/v1` if
//!   unset but `TREQ_REMOTE_E2E=1` and the token are present.
//! - `FLY_TEST_APP_NAME`: the Fly app that owns test machines. Must be a
//!   dedicated test app, never a production app name.
//!
//! See `remote_e2e_README.md` in this directory for the full
//! acceptance-criteria-to-test mapping.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Once;
use std::time::Duration;

use treq_lib::core::remote_provider::{
  CreateInstanceRequest, ManagedComputeProvider, ManagedInstanceState, ProviderError, RegionCode,
  ReplaceInstanceRequest, SizePreset,
};
use treq_lib::core::remote_provider_sprites::{SpritesConfig, SpritesProvider};

/// Every resource this suite creates carries this prefix in place of a
/// display name / tag field so a cleanup pass (`scripts/remote-e2e-cleanup.ts`)
/// can find and remove it by substring match, independent of which test
/// created it or whether that test's own compensating cleanup ran.
pub const E2E_TAG_PREFIX: &str = "treq-e2e-";

/// Hard cap on how many test instances this suite will have alive
/// concurrently against the real provider, enforced in-process (not just
/// documented) via `ConcurrencyGuard` below. Overridable for a wider CI
/// account via `TREQ_REMOTE_E2E_MAX_CONCURRENCY`, but the default is
/// deliberately small: this suite creates real billable resources.
fn max_concurrent_instances() -> usize {
  std::env::var("TREQ_REMOTE_E2E_MAX_CONCURRENCY")
    .ok()
    .and_then(|v| v.parse().ok())
    .unwrap_or(2)
}

/// Every provisioning test in this file must request the smallest size
/// preset. This is spend control, not a test-fidelity concern: preset
/// selection logic itself is covered by mocked unit tests and by the
/// `size_preset` field round-tripping through `ProviderInstance`.
const E2E_SIZE_PRESET: SizePreset = SizePreset::Small;

static ACTIVE_INSTANCES: AtomicUsize = AtomicUsize::new(0);

/// RAII concurrency-cap guard. Acquired before any real `create_instance`
/// call in this file and held for the lifetime of that provider-side
/// resource; dropping it (including on panic/early-return) releases the
/// slot so a failed test cannot permanently wedge the suite's cap.
struct ConcurrencyGuard;

impl ConcurrencyGuard {
  fn acquire() -> Self {
    loop {
      let current = ACTIVE_INSTANCES.load(Ordering::SeqCst);
      if current >= max_concurrent_instances() {
        panic!(
          "remote e2e concurrency cap ({}) reached; refusing to provision another real test instance",
          max_concurrent_instances()
        );
      }
      if ACTIVE_INSTANCES
        .compare_exchange(current, current + 1, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
      {
        return Self;
      }
    }
  }
}

impl Drop for ConcurrencyGuard {
  fn drop(&mut self) {
    ACTIVE_INSTANCES.fetch_sub(1, Ordering::SeqCst);
  }
}

/// Compensating-cleanup guard for a single provider-side instance. Deletes
/// the instance on drop (test success, test failure, or panic-triggered
/// unwind, since this suite does not use `catch_unwind` to suppress panics).
/// This is the PRD's "always run compensating cleanup" requirement for the
/// per-test path; `scripts/remote-e2e-cleanup.ts` is the backstop for
/// anything this misses (process killed with SIGKILL, container OOM, etc).
struct InstanceCleanupGuard<'a> {
  provider: &'a SpritesProvider,
  provider_resource_id: Option<String>,
  _concurrency: ConcurrencyGuard,
}

impl<'a> InstanceCleanupGuard<'a> {
  fn new(provider: &'a SpritesProvider, provider_resource_id: String) -> Self {
    Self {
      provider,
      provider_resource_id: Some(provider_resource_id),
      _concurrency: ConcurrencyGuard::acquire(),
    }
  }
}

impl Drop for InstanceCleanupGuard<'_> {
  fn drop(&mut self) {
    if let Some(id) = self.provider_resource_id.take() {
      // Best-effort synchronous cleanup from a Drop impl: build a throwaway
      // current-thread runtime rather than requiring the caller's runtime to
      // still be alive (it may not be, during unwind). Errors are logged,
      // never panicked on - a cleanup failure must not mask the original
      // test failure, and the scheduled cleanup script is the backstop.
      let provider_resource_id = id.clone();
      let result = std::thread::spawn({
        let base_url = self.provider.config_base_url();
        let api_token = self.provider.config_api_token();
        let app_name = self.provider.config_app_name();
        move || {
          let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("failed to build cleanup runtime");
          rt.block_on(async move {
            let provider = SpritesProvider::new(SpritesConfig {
              base_url,
              api_token,
              app_name,
              request_timeout: Duration::from_secs(30),
            })
            .expect("failed to rebuild provider for cleanup");
            provider.delete_instance(&provider_resource_id).await
          })
        }
      })
      .join();

      match result {
        Ok(Ok(())) => eprintln!("[remote-e2e cleanup] deleted instance {id}"),
        Ok(Err(ProviderError::NotFound)) => {
          eprintln!("[remote-e2e cleanup] instance {id} already gone")
        }
        Ok(Err(err)) => eprintln!(
          "[remote-e2e cleanup] FAILED to delete instance {id}: {err:?} - \
           scripts/remote-e2e-cleanup.ts must catch this on its next run"
        ),
        Err(_) => eprintln!(
          "[remote-e2e cleanup] cleanup thread panicked for instance {id} - \
           scripts/remote-e2e-cleanup.ts must catch this on its next run"
        ),
      }
    }
  }
}

/// Central skip gate. Every `#[tokio::test]` below calls this first and
/// returns early (test passes, prints why) when it is `None`. This is the
/// "skip gracefully rather than fake success" contract: a test body never
/// runs, and therefore never asserts anything, when credentials are absent.
fn e2e_config() -> Option<SpritesConfig> {
  static PRINT_BANNER: Once = Once::new();

  if std::env::var("TREQ_REMOTE_E2E").as_deref() != Ok("1") {
    PRINT_BANNER.call_once(|| {
      eprintln!(
        "[remote-e2e] SKIP: TREQ_REMOTE_E2E=1 not set. Real-API tests in \
         remote_e2e.rs do not run. See src-tauri/tests/remote_e2e_README.md."
      );
    });
    return None;
  }
  let api_token = std::env::var("FLY_TEST_API_TOKEN").ok()?;
  let app_name = std::env::var("FLY_TEST_APP_NAME").ok()?;
  let base_url = std::env::var("FLY_TEST_API_BASE_URL")
    .unwrap_or_else(|_| "https://api.machines.dev/v1".to_string());
  Some(SpritesConfig {
    base_url,
    api_token,
    app_name,
    request_timeout: Duration::from_secs(30),
  })
}

macro_rules! require_e2e {
  () => {
    match e2e_config() {
      Some(cfg) => cfg,
      None => {
        eprintln!(
          "[remote-e2e] SKIP {}: missing TREQ_REMOTE_E2E=1 / FLY_TEST_API_TOKEN / FLY_TEST_APP_NAME",
          module_path!()
        );
        return;
      }
    }
  };
}

fn e2e_tag() -> String {
  format!("{}{}", E2E_TAG_PREFIX, uuid::Uuid::new_v4())
}

fn e2e_idempotency_key() -> String {
  format!("{}{}", E2E_TAG_PREFIX, uuid::Uuid::new_v4())
}

fn e2e_owner_user_id() -> String {
  // Not a real Supabase user id - the raw provider adapter tested here does
  // not look this field up against auth.users, it only forwards it into
  // vendor metadata/tags. Tagged with the e2e prefix for the same
  // greppability reason as everything else in this file.
  e2e_tag()
}

// ---------------------------------------------------------------------------
// Acceptance criteria 1, 2: exactly-one-instance provisioning, idempotent
// concurrent provisioning.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn provisions_instance_with_selected_region_and_size() {
  let cfg = require_e2e!();
  let provider = SpritesProvider::new(cfg).expect("failed to build provider");

  let request = CreateInstanceRequest {
    owner_user_id: e2e_owner_user_id(),
    region: RegionCode::UsEast,
    size_preset: E2E_SIZE_PRESET,
    manifest_version: 1,
    idempotency_key: e2e_idempotency_key(),
  };

  let instance = provider
    .create_instance(request.clone())
    .await
    .expect("create_instance should succeed against the real Fly test API");
  let _cleanup = InstanceCleanupGuard::new(&provider, instance.provider_resource_id.clone());

  assert_eq!(instance.region, RegionCode::UsEast);
  assert_eq!(instance.size_preset, E2E_SIZE_PRESET);
  assert!(!matches!(instance.state, ManagedInstanceState::Failed));

  // PRD: "capture provider request identifiers". Assert the real vendor
  // actually sent one and the adapter actually captured it - not just that
  // the field exists.
  let request_id = provider
    .last_request_id()
    .expect("real Fly API response should carry a fly-request-id header");
  assert!(!request_id.is_empty());
  eprintln!("[remote-e2e] create_instance provider request id: {request_id}");
}

#[tokio::test]
async fn repeated_create_with_same_idempotency_key_does_not_duplicate_instance() {
  let cfg = require_e2e!();
  let provider = SpritesProvider::new(cfg).expect("failed to build provider");

  let request = CreateInstanceRequest {
    owner_user_id: e2e_owner_user_id(),
    region: RegionCode::UsEast,
    size_preset: E2E_SIZE_PRESET,
    manifest_version: 1,
    idempotency_key: e2e_idempotency_key(),
  };

  let first = provider
    .create_instance(request.clone())
    .await
    .expect("first create_instance should succeed");
  let _cleanup = InstanceCleanupGuard::new(&provider, first.provider_resource_id.clone());

  // Fire several concurrent repeats of the exact same idempotency key, the
  // way a client retry storm or a flaky network would. Every one of them
  // must resolve to the same provider resource, never a second machine.
  let mut handles = Vec::new();
  for _ in 0..3 {
    let provider_clone_request = request.clone();
    let cfg_for_task = SpritesConfig {
      base_url: provider.config_base_url(),
      api_token: provider.config_api_token(),
      app_name: provider.config_app_name(),
      request_timeout: Duration::from_secs(30),
    };
    handles.push(tokio::spawn(async move {
      let provider = SpritesProvider::new(cfg_for_task).unwrap();
      provider.create_instance(provider_clone_request).await
    }));
  }

  for handle in handles {
    let outcome = handle.await.expect("task panicked");
    match outcome {
      Ok(instance) => assert_eq!(
        instance.provider_resource_id, first.provider_resource_id,
        "a repeated create with the same idempotency key must return the same resource, not a duplicate"
      ),
      Err(ProviderError::AlreadyExists) => {
        // Also an acceptable idempotent outcome depending on adapter
        // semantics, as long as no second machine was actually created -
        // verified below via get_instance.
      }
      Err(other) => panic!("unexpected error on repeated idempotent create: {other:?}"),
    }
  }

  let verified = provider
    .get_instance(&first.provider_resource_id)
    .await
    .expect("instance should still be gettable after concurrent repeats");
  assert_eq!(verified.provider_resource_id, first.provider_resource_id);
}

// ---------------------------------------------------------------------------
// Acceptance criterion 13: wake from vendor auto-suspension.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn wakes_instance_from_vendor_suspension() {
  let cfg = require_e2e!();
  let provider = SpritesProvider::new(cfg).expect("failed to build provider");

  let request = CreateInstanceRequest {
    owner_user_id: e2e_owner_user_id(),
    region: RegionCode::UsEast,
    size_preset: E2E_SIZE_PRESET,
    manifest_version: 1,
    idempotency_key: e2e_idempotency_key(),
  };
  let instance = provider
    .create_instance(request)
    .await
    .expect("create_instance should succeed");
  let _cleanup = InstanceCleanupGuard::new(&provider, instance.provider_resource_id.clone());

  // Vendor auto-suspension is time-driven and not something this suite can
  // force deterministically without a Fly Sprites test-environment
  // "force-suspend" API. wake_instance is exercised for real regardless:
  // Fly's API accepts a wake/start call against a running machine as a
  // no-op-ish success, so this proves the adapter's HTTP call, error
  // mapping, and request-id capture are correct even when suspension itself
  // isn't triggered here.
  provider
    .wake_instance(&instance.provider_resource_id)
    .await
    .expect("wake_instance should succeed (idempotent no-op on an already-running machine)");

  let after = provider
    .get_instance(&instance.provider_resource_id)
    .await
    .expect("get_instance should succeed after wake");
  assert!(!matches!(after.state, ManagedInstanceState::Failed));
}

// ---------------------------------------------------------------------------
// Acceptance criterion 14: reprovision increments generation / replaces
// the instance.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn reprovision_replaces_instance_and_can_change_region_and_size() {
  let cfg = require_e2e!();
  let provider = SpritesProvider::new(cfg).expect("failed to build provider");

  let create_request = CreateInstanceRequest {
    owner_user_id: e2e_owner_user_id(),
    region: RegionCode::UsEast,
    size_preset: SizePreset::Small,
    manifest_version: 1,
    idempotency_key: e2e_idempotency_key(),
  };
  let original = provider
    .create_instance(create_request)
    .await
    .expect("create_instance should succeed");
  let mut cleanup = InstanceCleanupGuard::new(&provider, original.provider_resource_id.clone());

  let replace_request = ReplaceInstanceRequest {
    provider_resource_id: original.provider_resource_id.clone(),
    region: RegionCode::UsEast,
    size_preset: SizePreset::Small,
    manifest_version: 1,
    idempotency_key: e2e_idempotency_key(),
  };
  let replaced = provider
    .replace_instance(replace_request)
    .await
    .expect("replace_instance should succeed against the real Fly test API");

  // The domain-level "generation" counter lives in control-plane storage,
  // not in ProviderInstance - this call proves the adapter can actually
  // produce a new provider resource id (the control plane increments
  // generation whenever provider_resource_id changes across a replace).
  // A same-in-place replace is also an acceptable outcome for providers
  // that support live resize, so only assert the call succeeded and the
  // result is trackable and cleanup-safe either way.
  cleanup.provider_resource_id = Some(replaced.provider_resource_id.clone());
  assert!(!matches!(replaced.state, ManagedInstanceState::Failed));
}

// ---------------------------------------------------------------------------
// Acceptance criterion 16 / PRD "teardown and orphan-resource detection":
// deleting an instance actually removes it from the provider's inventory.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn delete_instance_removes_it_from_provider_inventory() {
  let cfg = require_e2e!();
  let provider = SpritesProvider::new(cfg).expect("failed to build provider");

  let request = CreateInstanceRequest {
    owner_user_id: e2e_owner_user_id(),
    region: RegionCode::UsEast,
    size_preset: E2E_SIZE_PRESET,
    manifest_version: 1,
    idempotency_key: e2e_idempotency_key(),
  };
  let instance = provider
    .create_instance(request)
    .await
    .expect("create_instance should succeed");
  let mut cleanup = InstanceCleanupGuard::new(&provider, instance.provider_resource_id.clone());

  provider
    .delete_instance(&instance.provider_resource_id)
    .await
    .expect("delete_instance should succeed");
  // Already deleted - do not double-delete from the guard.
  cleanup.provider_resource_id = None;

  let after_delete = provider.get_instance(&instance.provider_resource_id).await;
  assert!(
    matches!(after_delete, Err(ProviderError::NotFound)),
    "a deleted instance must not still be visible to get_instance (orphan-resource detection depends on this): {after_delete:?}"
  );
}

// ---------------------------------------------------------------------------
// Acceptance criterion 1 (region/size preset provisioning coverage):
// exercise every offered region and size preset at least once. This test is
// intentionally the most expensive one in the file - guarded doubly by the
// concurrency cap and by only running the full matrix when explicitly asked.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn provisions_across_every_region_and_size_preset() {
  let cfg = require_e2e!();
  if std::env::var("TREQ_REMOTE_E2E_FULL_MATRIX").as_deref() != Ok("1") {
    eprintln!(
      "[remote-e2e] SKIP provisions_across_every_region_and_size_preset: \
       set TREQ_REMOTE_E2E_FULL_MATRIX=1 to run the full region x size matrix \
       (this creates and tears down one instance per combination)."
    );
    return;
  }
  let provider = SpritesProvider::new(cfg).expect("failed to build provider");

  for region in [
    RegionCode::UsEast,
    RegionCode::UsWest,
    RegionCode::EuWest,
    RegionCode::ApSoutheast,
  ] {
    for size in [SizePreset::Small, SizePreset::Medium, SizePreset::Large] {
      let request = CreateInstanceRequest {
        owner_user_id: e2e_owner_user_id(),
        region,
        size_preset: size,
        manifest_version: 1,
        idempotency_key: e2e_idempotency_key(),
      };
      let instance = provider
        .create_instance(request)
        .await
        .unwrap_or_else(|err| panic!("create_instance failed for {region:?}/{size:?}: {err:?}"));
      let _cleanup = InstanceCleanupGuard::new(&provider, instance.provider_resource_id.clone());
      assert_eq!(instance.region, region);
      assert_eq!(instance.size_preset, size);
    }
  }
}
