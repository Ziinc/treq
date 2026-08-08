//! Background PR-status polling for workspace sidebars.
//!
//! The UI used to call `gh pr view` once per sidebar row on a React Query
//! interval. With many workspaces that flooded the WebView with concurrent
//! IPC + subprocess work and caused periodic stutter. This module owns the
//! polling: a single background thread refreshes PR info for every watched
//! repo's workspace branches and serves results from an in-memory cache.
//! Frontend reads are cache-only and never shell out to `gh`.

use crate::github::PrInfo;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::Duration;

/// Default cadence matching the previous frontend `refetchInterval`.
pub const DEFAULT_POLL_INTERVAL: Duration = Duration::from_secs(60);

/// Fetch PR info for `(repo_path, branch_name)`.
pub type PrFetchFn = Arc<dyn Fn(&str, &str) -> Result<Option<PrInfo>, String> + Send + Sync>;

/// List workspace branch names that should be polled for a repo.
pub type BranchListFn = Arc<dyn Fn(&str) -> Result<Vec<String>, String> + Send + Sync>;

/// Callback fired after a repo's cache is refreshed (used to emit Tauri events).
pub type OnUpdateFn = Arc<dyn Fn(&str, &HashMap<String, Option<PrInfo>>) + Send + Sync>;

/// Per-repo map of `branch_name -> Option<PrInfo>` (None = no open/known PR).
pub type RepoPrCache = HashMap<String, Option<PrInfo>>;

struct Inner {
    cache: Mutex<HashMap<String, RepoPrCache>>,
    watched: Mutex<HashSet<String>>,
    fetch: PrFetchFn,
    list_branches: BranchListFn,
    on_update: Mutex<Option<OnUpdateFn>>,
    poll_interval: Duration,
    /// Signaled to wake the background loop early (watch/refresh/shutdown).
    wake: (Mutex<()>, Condvar),
    /// Set while a wake should trigger an immediate poll of all watched repos.
    pending_wake: AtomicBool,
    shutdown: AtomicBool,
    loop_started: AtomicBool,
}

/// Process-wide background PR status poller + cache.
pub struct PrStatusManager {
    inner: Arc<Inner>,
}

impl PrStatusManager {
    pub fn new(fetch: PrFetchFn, list_branches: BranchListFn) -> Self {
        Self::new_with_interval(fetch, list_branches, DEFAULT_POLL_INTERVAL)
    }

    pub fn new_with_interval(
        fetch: PrFetchFn,
        list_branches: BranchListFn,
        poll_interval: Duration,
    ) -> Self {
        Self {
            inner: Arc::new(Inner {
                cache: Mutex::new(HashMap::new()),
                watched: Mutex::new(HashSet::new()),
                fetch,
                list_branches,
                on_update: Mutex::new(None),
                poll_interval,
                wake: (Mutex::new(()), Condvar::new()),
                pending_wake: AtomicBool::new(false),
                shutdown: AtomicBool::new(false),
                loop_started: AtomicBool::new(false),
            }),
        }
    }

    /// Convenience for tests that want a custom interval after `new`.
    pub fn with_interval(self, poll_interval: Duration) -> Self {
        let fetch = Arc::clone(&self.inner.fetch);
        let list_branches = Arc::clone(&self.inner.list_branches);
        let on_update = self.inner.on_update.lock().unwrap().clone();
        let mgr = Self::new_with_interval(fetch, list_branches, poll_interval);
        if let Some(cb) = on_update {
            mgr.set_on_update(cb);
        }
        mgr
    }

    pub fn set_on_update(&self, cb: OnUpdateFn) {
        *self.inner.on_update.lock().unwrap() = Some(cb);
    }

    /// Ensure the background poll loop is running (idempotent).
    pub fn ensure_started(&self) {
        if self
            .inner
            .loop_started
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return;
        }
        let inner = Arc::clone(&self.inner);
        thread::Builder::new()
            .name("pr-status-poller".into())
            .spawn(move || background_loop(inner))
            .expect("failed to spawn pr-status-poller thread");
    }

    /// Start watching a repo. Triggers an immediate background refresh.
    pub fn watch_repo(&self, repo_path: &str) {
        {
            let mut watched = self.inner.watched.lock().unwrap();
            watched.insert(repo_path.to_string());
        }
        self.ensure_started();
        self.request_wake();
    }

    /// Stop watching a repo. Cached entries are retained until overwritten.
    pub fn unwatch_repo(&self, repo_path: &str) {
        let mut watched = self.inner.watched.lock().unwrap();
        watched.remove(repo_path);
    }

    /// Synchronously refresh one repo (tests + post-create-PR invalidation).
    pub fn refresh_repo_now(&self, repo_path: &str) {
        poll_one_repo(&self.inner, repo_path);
    }

    /// Overwrite a single branch entry (e.g. after an on-demand `gh pr view`).
    pub fn put_cached(&self, repo_path: &str, branch_name: &str, info: Option<PrInfo>) {
        let mut cache = self.inner.cache.lock().unwrap();
        cache
            .entry(repo_path.to_string())
            .or_default()
            .insert(branch_name.to_string(), info);
    }

    /// Cache snapshot for a repo. Empty if never polled.
    pub fn list_cached(&self, repo_path: &str) -> RepoPrCache {
        self.inner
            .cache
            .lock()
            .unwrap()
            .get(repo_path)
            .cloned()
            .unwrap_or_default()
    }

    /// Cached PR for a branch. `None` if the branch has not been polled yet;
    /// `Some(None)` if polled and no PR exists; `Some(Some(info))` otherwise.
    pub fn get_cached(&self, repo_path: &str, branch_name: &str) -> Option<Option<PrInfo>> {
        self.inner
            .cache
            .lock()
            .unwrap()
            .get(repo_path)?
            .get(branch_name)
            .cloned()
    }

    fn request_wake(&self) {
        self.inner.pending_wake.store(true, Ordering::SeqCst);
        self.inner.wake.1.notify_one();
    }

    /// Test helper: whether the given repo is currently watched.
    #[cfg(test)]
    pub fn is_watching(&self, repo_path: &str) -> bool {
        self.inner.watched.lock().unwrap().contains(repo_path)
    }

    /// Stop the background loop (tests). Production keeps it for process life.
    #[cfg(test)]
    pub fn shutdown(&self) {
        self.inner.shutdown.store(true, Ordering::SeqCst);
        self.inner.wake.1.notify_one();
    }
}

fn background_loop(inner: Arc<Inner>) {
    loop {
        if inner.shutdown.load(Ordering::SeqCst) {
            break;
        }

        let repos: Vec<String> = inner.watched.lock().unwrap().iter().cloned().collect();
        for repo in &repos {
            if inner.shutdown.load(Ordering::SeqCst) {
                break;
            }
            poll_one_repo(&inner, repo);
        }

        // Wait for the poll interval, or wake early on watch/refresh/shutdown.
        let (lock, cvar) = &inner.wake;
        let guard = lock.lock().unwrap();
        let (_guard, _timeout) = cvar
            .wait_timeout_while(guard, inner.poll_interval, |_| {
                !inner.pending_wake.load(Ordering::SeqCst) && !inner.shutdown.load(Ordering::SeqCst)
            })
            .unwrap();
        inner.pending_wake.store(false, Ordering::SeqCst);
    }
}

fn poll_one_repo(inner: &Inner, repo_path: &str) {
    let branches = match (inner.list_branches)(repo_path) {
        Ok(b) => b,
        Err(e) => {
            log::warn!("pr-status: failed to list branches for {repo_path}: {e}");
            return;
        }
    };

    let mut next: RepoPrCache = HashMap::new();
    for branch in branches {
        match (inner.fetch)(repo_path, &branch) {
            Ok(info) => {
                next.insert(branch, info);
            }
            Err(e) => {
                // Keep prior cache entry on transient gh failures so the UI
                // does not flicker to "no PR".
                log::warn!("pr-status: fetch failed for {repo_path}#{branch}: {e}");
                if let Some(prev) = inner
                    .cache
                    .lock()
                    .unwrap()
                    .get(repo_path)
                    .and_then(|m| m.get(&branch).cloned())
                {
                    next.insert(branch, prev);
                }
            }
        }
    }

    {
        let mut cache = inner.cache.lock().unwrap();
        cache.insert(repo_path.to_string(), next.clone());
    }

    if let Some(cb) = inner.on_update.lock().unwrap().as_ref() {
        cb(repo_path, &next);
    }
}

// ── Production wiring ────────────────────────────────────────────────────────

static GLOBAL: std::sync::OnceLock<PrStatusManager> = std::sync::OnceLock::new();

fn production_fetch() -> PrFetchFn {
    Arc::new(|repo_path: &str, branch_name: &str| {
        let gh = crate::binary_paths::get_binary_path("gh")
            .or_else(|| crate::binary_paths::detect_binary("gh"))
            .ok_or_else(|| "gh CLI not found".to_string())?;
        let path = crate::binary_paths::get_extended_path();
        crate::github::get_pr_info_via_gh_impl(&gh, repo_path, branch_name, &path)
    })
}

fn production_list_branches() -> BranchListFn {
    Arc::new(|repo_path: &str| {
        let workspaces = crate::local_db::get_workspaces(repo_path)?;
        Ok(workspaces.into_iter().map(|w| w.branch_name).collect())
    })
}

/// Initialize (or return) the process-global manager used by Tauri + NAPI.
pub fn global() -> &'static PrStatusManager {
    GLOBAL.get_or_init(|| PrStatusManager::new(production_fetch(), production_list_branches()))
}

/// Attach a Tauri event emitter so cache refreshes notify the frontend.
pub fn set_app_handle(app: tauri::AppHandle) {
    use tauri::Emitter;
    global().set_on_update(Arc::new(move |repo_path, statuses| {
        let payload = serde_json::json!({
            "repo_path": repo_path,
            "statuses": statuses,
        });
        let _ = app.emit("pr-statuses-updated", payload);
    }));
    global().ensure_started();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    fn sample_pr(number: u64, branch: &str) -> PrInfo {
        PrInfo {
            number,
            title: format!("PR {number}"),
            state: "OPEN".into(),
            url: format!("https://github.com/o/r/pull/{number}"),
            head_ref_name: branch.into(),
            base_ref_name: "main".into(),
            merge_state_status: Some("CLEAN".into()),
            is_draft: false,
        }
    }

    fn manager_with(
        fetch: PrFetchFn,
        branches: Vec<String>,
    ) -> (PrStatusManager, Arc<AtomicUsize>) {
        let fetch_count = Arc::new(AtomicUsize::new(0));
        let fetch_count_clone = Arc::clone(&fetch_count);
        let wrapped: PrFetchFn = Arc::new(move |repo, branch| {
            fetch_count_clone.fetch_add(1, Ordering::SeqCst);
            fetch(repo, branch)
        });
        let list: BranchListFn = Arc::new(move |_| Ok(branches.clone()));
        (
            PrStatusManager::new(wrapped, list).with_interval(Duration::from_secs(60)),
            fetch_count,
        )
    }

    #[test]
    fn refresh_repo_now_caches_pr_info_per_branch() {
        let fetch: PrFetchFn = Arc::new(|_repo, branch| {
            if branch == "feat/a" {
                Ok(Some(sample_pr(1, branch)))
            } else {
                Ok(None)
            }
        });
        let (mgr, count) = manager_with(fetch, vec!["feat/a".into(), "feat/b".into()]);

        mgr.refresh_repo_now("/tmp/repo");

        let cached = mgr.list_cached("/tmp/repo");
        assert_eq!(cached.len(), 2);
        assert_eq!(cached.get("feat/a").unwrap().as_ref().unwrap().number, 1);
        assert!(cached.get("feat/b").unwrap().is_none());
        assert_eq!(count.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn list_cached_is_read_only_and_does_not_refetch() {
        let fetch: PrFetchFn = Arc::new(|_, branch| Ok(Some(sample_pr(7, branch))));
        let (mgr, count) = manager_with(fetch, vec!["feat".into()]);

        mgr.refresh_repo_now("/tmp/repo");
        assert_eq!(count.load(Ordering::SeqCst), 1);

        let _ = mgr.list_cached("/tmp/repo");
        let _ = mgr.list_cached("/tmp/repo");
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn get_cached_distinguishes_missing_vs_no_pr() {
        let fetch: PrFetchFn = Arc::new(|_, branch| {
            if branch == "has-pr" {
                Ok(Some(sample_pr(3, branch)))
            } else {
                Ok(None)
            }
        });
        let (mgr, _) = manager_with(fetch, vec!["has-pr".into(), "no-pr".into()]);

        assert_eq!(mgr.get_cached("/tmp/repo", "has-pr"), None);

        mgr.refresh_repo_now("/tmp/repo");

        match mgr.get_cached("/tmp/repo", "has-pr") {
            Some(Some(info)) => assert_eq!(info.number, 3),
            other => panic!("expected Some(Some(pr)), got {other:?}"),
        }
        assert_eq!(mgr.get_cached("/tmp/repo", "no-pr"), Some(None));
        assert_eq!(mgr.get_cached("/tmp/repo", "never-listed"), None);
    }

    #[test]
    fn fetch_error_preserves_previous_cache_entry() {
        let fail = Arc::new(AtomicBool::new(false));
        let fail_flag = Arc::clone(&fail);
        let fetch: PrFetchFn = Arc::new(move |_, branch| {
            if fail_flag.load(Ordering::SeqCst) {
                Err("gh auth failed".into())
            } else {
                Ok(Some(sample_pr(9, branch)))
            }
        });
        let (mgr, _) = manager_with(fetch, vec!["feat".into()]);

        mgr.refresh_repo_now("/tmp/repo");
        assert_eq!(
            mgr.list_cached("/tmp/repo")
                .get("feat")
                .unwrap()
                .as_ref()
                .unwrap()
                .number,
            9
        );

        fail.store(true, Ordering::SeqCst);
        mgr.refresh_repo_now("/tmp/repo");
        assert_eq!(
            mgr.list_cached("/tmp/repo")
                .get("feat")
                .unwrap()
                .as_ref()
                .unwrap()
                .number,
            9
        );
    }

    #[test]
    fn watch_repo_registers_and_unwatch_clears() {
        let fetch: PrFetchFn = Arc::new(|_, _| Ok(None));
        let (mgr, _) = manager_with(fetch, vec!["feat".into()]);

        assert!(!mgr.is_watching("/tmp/repo"));
        mgr.watch_repo("/tmp/repo");
        assert!(mgr.is_watching("/tmp/repo"));
        mgr.unwatch_repo("/tmp/repo");
        assert!(!mgr.is_watching("/tmp/repo"));
        mgr.shutdown();
    }

    #[test]
    fn on_update_fires_after_refresh() {
        let fetch: PrFetchFn = Arc::new(|_, b| Ok(Some(sample_pr(1, b))));
        let (mgr, _) = manager_with(fetch, vec!["feat".into()]);
        let seen = Arc::new(Mutex::new(Vec::<String>::new()));
        let seen_cb = Arc::clone(&seen);
        mgr.set_on_update(Arc::new(move |repo, statuses| {
            seen_cb
                .lock()
                .unwrap()
                .push(format!("{repo}:{}", statuses.len()));
        }));

        mgr.refresh_repo_now("/tmp/repo");
        let events = seen.lock().unwrap().clone();
        assert_eq!(events, vec!["/tmp/repo:1".to_string()]);
    }

    #[test]
    fn background_loop_polls_watched_repo() {
        let fetch: PrFetchFn = Arc::new(|_, b| Ok(Some(sample_pr(42, b))));
        let list: BranchListFn = Arc::new(|_| Ok(vec!["feat".into()]));
        let mgr = PrStatusManager::new(fetch, list).with_interval(Duration::from_millis(50));

        mgr.watch_repo("/tmp/bg");
        // watch_repo wakes the loop; wait until cache is populated.
        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        loop {
            if mgr
                .list_cached("/tmp/bg")
                .get("feat")
                .and_then(|v| v.as_ref())
                .is_some()
            {
                break;
            }
            if std::time::Instant::now() > deadline {
                panic!("background poll did not populate cache");
            }
            thread::sleep(Duration::from_millis(20));
        }

        assert_eq!(
            mgr.list_cached("/tmp/bg")
                .get("feat")
                .unwrap()
                .as_ref()
                .unwrap()
                .number,
            42
        );
        mgr.shutdown();
    }
}
