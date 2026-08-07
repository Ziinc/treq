use crate::core;
use crate::github::PrCiStatus;

pub(crate) struct WorkspacePrStatus {
    pub github_id: String,
    pub checks: Option<PrCiStatus>,
}

pub(crate) fn format_pr_status_lines(pr: &WorkspacePrStatus, indent: &str) -> Vec<String> {
    let mut lines = vec![format!("{indent}GitHub: {}", pr.github_id)];
    if let Some(checks) = &pr.checks {
        let summary = match checks.state.as_str() {
            "success" => format!("passing ({}/{})", checks.passed, checks.total),
            "failure" => format!(
                "failing ({} failed, {} pending, {} passed)",
                checks.failed, checks.pending, checks.passed
            ),
            _ => format!(
                "pending ({} pending, {} passed, {} failed)",
                checks.pending, checks.passed, checks.failed
            ),
        };
        lines.push(format!("{indent}Checks: {summary}"));
    }
    lines
}

pub(crate) fn print_workspace_partial_status(
    status: &core::WorkspaceSidebarStatus,
    pr: Option<&WorkspacePrStatus>,
) {
    let flags = if status.has_conflicts {
        " [CONFLICTS]"
    } else {
        ""
    };
    println!("  {} {}{}", "●", status.current.branch_name, flags);
    if let Some(ref description) = status.current.description {
        println!("    Description: {}", description);
    }
    if let Some(ref target) = status.current.target_branch {
        println!("    Target: {}", target);
    }
    if let Some(pr) = pr {
        for line in format_pr_status_lines(pr, "    ") {
            println!("{line}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn checks(state: &str, passed: u32, failed: u32, pending: u32) -> PrCiStatus {
        PrCiStatus {
            state: state.to_string(),
            total: passed + failed + pending,
            passed,
            failed,
            pending,
            checks: Vec::new(),
        }
    }

    #[test]
    fn formats_github_id_and_passing_checks() {
        let pr = WorkspacePrStatus {
            github_id: "acme/treq#42".to_string(),
            checks: Some(checks("success", 3, 0, 0)),
        };

        assert_eq!(
            format_pr_status_lines(&pr, "    "),
            vec!["    GitHub: acme/treq#42", "    Checks: passing (3/3)"]
        );
    }

    #[test]
    fn formats_failing_checks_with_counts() {
        let pr = WorkspacePrStatus {
            github_id: "octo/app#7".to_string(),
            checks: Some(checks("failure", 2, 1, 1)),
        };

        assert_eq!(
            format_pr_status_lines(&pr, "  "),
            vec![
                "  GitHub: octo/app#7",
                "  Checks: failing (1 failed, 1 pending, 2 passed)"
            ]
        );
    }

    #[test]
    fn omits_checks_when_github_reports_none() {
        let pr = WorkspacePrStatus {
            github_id: "octo/app#8".to_string(),
            checks: None,
        };

        assert_eq!(format_pr_status_lines(&pr, ""), vec!["GitHub: octo/app#8"]);
    }
}

pub(crate) fn print_workspace_status_detail(
    status: &core::WorkspaceStatus,
    pr: Option<&WorkspacePrStatus>,
) {
    println!("Workspace: {}", status.partial.current.branch_name);
    if let Some(ref description) = status.partial.current.description {
        println!("  Description: {}", description);
    }
    if let Some(ref target) = &status.target {
        println!("  Target: {}", target.branch_name);
    }
    println!(
        "  Changes: {}",
        if status.partial.has_changes {
            "yes"
        } else {
            "no"
        }
    );
    println!(
        "  Conflicts: {}",
        if status.partial.has_conflicts {
            "YES"
        } else {
            "no"
        }
    );
    println!("  Commits ahead: {}", status.commits_ahead_of_target.len());
    if let Some(pr) = pr {
        for line in format_pr_status_lines(pr, "  ") {
            println!("{line}");
        }
    }

    if !status.children.is_empty() {
        println!("  Children:");
        for child in &status.children {
            println!("    - {}", child.branch_name);
        }
    }

    if !status.commits_ahead_of_target.is_empty() {
        println!("  Commits:");
        for commit in &status.commits_ahead_of_target {
            let msg = commit.message.lines().next().unwrap_or("");
            println!("    {} {}", &commit.hash[..8.min(commit.hash.len())], msg);
        }
    }
}
