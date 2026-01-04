// Command modules
pub mod binary;
pub mod file_view;
pub mod file_watcher;
pub mod filesystem;
pub mod jj_commands;
pub mod pty_commands;
pub mod session;
pub mod settings;
pub mod workspace;

// Re-export all commands for convenient access
pub use binary::*;
pub use file_view::*;
pub use file_watcher::*;
pub use filesystem::*;
pub use jj_commands::*;
pub use pty_commands::*;
pub use session::*;
pub use settings::*;
pub use workspace::*;
