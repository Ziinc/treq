pub mod app;
pub mod changes;
pub mod commits;
pub mod repo;
pub mod workspaces;
pub use app::*;
pub use changes::*;
pub use commits::*;
pub use repo::*;
pub use workspaces::*;

pub const DEFAULT_CONFLICT_MARKER_STYLE: &str = "git";

pub fn resolve_conflict_marker_style_from_db(db: &crate::db::Database) -> String {
    db.get_setting("conflict_marker_style")
        .ok()
        .flatten()
        .and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
        .unwrap_or_else(|| DEFAULT_CONFLICT_MARKER_STYLE.to_string())
}

pub fn resolve_conflict_marker_style(db: &std::sync::Mutex<crate::db::Database>) -> String {
    resolve_conflict_marker_style_from_db(&db.lock().unwrap())
}
