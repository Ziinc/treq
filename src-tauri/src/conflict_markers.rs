use serde::{Deserialize, Serialize};

/// A parsed conflict region from file content.
///
/// Represents a single conflict block delimited by `<<<<<<<` and `>>>>>>>` markers,
/// supporting JJ diff, JJ snapshot, JJ git, and pure git diff3 formats.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConflictRegion {
    pub id: String,
    pub file_path: String,
    pub conflict_number: usize,
    pub total_conflicts: usize,
    pub start_line: usize,
    pub end_line: usize,
    pub content: String,
    pub marker_style: String,
}

/// Detect if a line is any conflict marker.
///
/// # Arguments
/// * `line` - A single line of text to check
///
/// # Returns
/// `true` if the line starts with 7 consecutive `<`, `>`, `%`, `+`, `-`, `|`, or `=` characters.
pub fn is_conflict_marker(line: &str) -> bool {
    let trimmed = line.trim_start();
    if trimmed.len() < 7 {
        return false;
    }
    let first = trimmed.as_bytes()[0];
    matches!(first, b'<' | b'>' | b'%' | b'+' | b'-' | b'|' | b'=')
        && trimmed.as_bytes()[..7].iter().all(|&b| b == first)
}

/// Parse all conflict regions from file content.
///
/// # Arguments
/// * `content` - The full text content of a file
/// * `file_path` - Path to the file (used for generating region IDs)
///
/// # Returns
/// A vector of `ConflictRegion` structs, one per conflict block found.
pub fn parse_conflict_markers(content: &str, file_path: &str) -> Vec<ConflictRegion> {
    let lines: Vec<&str> = content.split('\n').collect();
    let mut regions = Vec::new();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i];

        let trimmed = line.trim_start();
        if trimmed.len() < 7 || !trimmed.starts_with("<<<<<<<") {
            i += 1;
            continue;
        }

        let start_line = i + 1;

        let conflict_info = extract_conflict_info(line);
        let (conflict_number, total_conflicts, marker_style) = match conflict_info {
            Some((num, total, has_side)) => {
                let style = if has_side { "git" } else { "jj" };
                (num, total, style)
            }
            None => {
                (regions.len() + 1, 0, "git")
            }
        };

        let mut end_line = start_line;
        let mut conflict_content = String::from(line);
        conflict_content.push('\n');

        let mut j = i + 1;
        while j < lines.len() {
            conflict_content.push_str(lines[j]);
            conflict_content.push('\n');
            if lines[j].trim_start().starts_with(">>>>>>>") {
                end_line = j + 1;
                i = j;
                break;
            }
            j += 1;
        }

        regions.push(ConflictRegion {
            id: format!("{}-conflict-{}", file_path, conflict_number),
            file_path: file_path.to_string(),
            conflict_number,
            total_conflicts,
            start_line,
            end_line,
            content: conflict_content.trim().to_string(),
            marker_style: marker_style.to_string(),
        });

        i += 1;
    }

    regions
}

/// Extract conflict number, total, and whether it's a "Side #" style marker.
///
/// # Returns
/// `Some((conflict_number, total_conflicts, has_side_marker))` if "Conflict N of M" is found.
fn extract_conflict_info(line: &str) -> Option<(usize, usize, bool)> {
    let conflict_pos = line.find("Conflict ")?;
    let rest = &line[conflict_pos + 9..];

    let num_end = rest.find(|c: char| !c.is_ascii_digit())?;
    if num_end == 0 {
        return None;
    }
    let num: usize = rest[..num_end].parse().ok()?;

    let after_num = rest[num_end..].trim_start();
    if !after_num.starts_with("of ") {
        return None;
    }
    let total_rest = &after_num[3..];
    let total_end = total_rest
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(total_rest.len());
    if total_end == 0 {
        return None;
    }
    let total: usize = total_rest[..total_end].parse().ok()?;

    let has_side = line.contains("Side #");

    Some((num, total, has_side))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_conflict_marker_all_types() {
        assert!(is_conflict_marker("<<<<<<< Conflict 1 of 1"));
        assert!(is_conflict_marker(">>>>>>> Conflict 1 of 1 ends"));
        assert!(is_conflict_marker("%%%%%%%"));
        assert!(is_conflict_marker("+++++++"));
        assert!(is_conflict_marker("-------"));
        assert!(is_conflict_marker("||||||| Base"));
        assert!(is_conflict_marker("======="));
    }

    #[test]
    fn is_conflict_marker_with_suffixes() {
        assert!(is_conflict_marker("<<<<<<< Side #1 (Conflict 1 of 1)"));
        assert!(is_conflict_marker("||||||| \"merge base\""));
        assert!(is_conflict_marker("+++++++  \"commit A\""));
        assert!(is_conflict_marker("------- \"merge base\""));
    }

    #[test]
    fn is_conflict_marker_non_markers() {
        assert!(!is_conflict_marker("const foo = bar;"));
        assert!(!is_conflict_marker("<<<<<< short"));
        assert!(!is_conflict_marker("+added line"));
        assert!(!is_conflict_marker("-removed line"));
        assert!(!is_conflict_marker(""));
        assert!(!is_conflict_marker("abc"));
    }

    #[test]
    fn parse_jj_diff_single() {
        let content = "normal line\n\
            <<<<<<< Conflict 1 of 1\n\
            %%%%%%%\n\
             apple\n\
            -grape\n\
            +grapefruit\n\
            +++++++\n\
            APPLE GRAPE ORANGE\n\
            >>>>>>> Conflict 1 of 1 ends\n\
            more normal";

        let regions = parse_conflict_markers(content, "test.txt");
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].conflict_number, 1);
        assert_eq!(regions[0].total_conflicts, 1);
        assert_eq!(regions[0].start_line, 2);
        assert_eq!(regions[0].end_line, 9);
        assert_eq!(regions[0].marker_style, "jj");
        assert_eq!(regions[0].file_path, "test.txt");
        assert_eq!(regions[0].id, "test.txt-conflict-1");
    }

    #[test]
    fn parse_jj_diff_multiple() {
        let content = "<<<<<<< Conflict 1 of 2\n\
            %%%%%%%\n\
             line1\n\
            +modified1\n\
            +++++++\n\
            other side\n\
            >>>>>>> Conflict 1 of 2 ends\n\
            middle content\n\
            <<<<<<< Conflict 2 of 2\n\
            %%%%%%%\n\
             line2\n\
            +modified2\n\
            +++++++\n\
            other side 2\n\
            >>>>>>> Conflict 2 of 2 ends";

        let regions = parse_conflict_markers(content, "multi.txt");
        assert_eq!(regions.len(), 2);
        assert_eq!(regions[0].conflict_number, 1);
        assert_eq!(regions[0].total_conflicts, 2);
        assert_eq!(regions[1].conflict_number, 2);
        assert_eq!(regions[1].total_conflicts, 2);
    }

    #[test]
    fn parse_jj_snapshot() {
        let content = "<<<<<<< Conflict 1 of 1\n\
            +++++++ \"commit A\"\n\
            apple grapefruit orange\n\
            ------- \"merge base\"\n\
            apple grape orange\n\
            +++++++ \"commit B\"\n\
            APPLE GRAPE ORANGE\n\
            >>>>>>> Conflict 1 of 1 ends";

        let regions = parse_conflict_markers(content, "snapshot.txt");
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].conflict_number, 1);
        assert_eq!(regions[0].marker_style, "jj");
        assert!(regions[0].content.contains("+++++++ \"commit A\""));
        assert!(regions[0].content.contains("------- \"merge base\""));
    }

    #[test]
    fn parse_jj_git_style() {
        let content = "normal line\n\
            <<<<<<< Side #1 (Conflict 1 of 1)\n\
            ptyWriteSuppressEcho(sessionId, normalizeCommand(initialAutoCommandRef.current!)).catch(\n\
            ||||||| Base\n\
            ptyWrite(sessionId, normalizeCommand(initialAutoCommandRef.current!)).catch(\n\
            =======\n\
            ptyWrite(sessionId, normalizeCommand(autoCommand)).catch(\n\
            >>>>>>> Side #2 (Conflict 1 of 1 ends)\n\
            more normal";

        let regions = parse_conflict_markers(content, "jj-git.txt");
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].conflict_number, 1);
        assert_eq!(regions[0].total_conflicts, 1);
        assert_eq!(regions[0].start_line, 2);
        assert_eq!(regions[0].end_line, 8);
        assert_eq!(regions[0].marker_style, "git");
        assert!(regions[0].content.contains("||||||| Base"));
        assert!(regions[0].content.contains("======="));
        assert!(regions[0].content.contains("Side #1"));
        assert!(regions[0].content.contains("Side #2"));
    }

    #[test]
    fn parse_jj_git_style_multiple() {
        let content = "<<<<<<< Side #1 (Conflict 1 of 2)\n\
            line1a\n\
            ||||||| Base\n\
            line1b\n\
            =======\n\
            line1c\n\
            >>>>>>> Side #2 (Conflict 1 of 2 ends)\n\
            middle\n\
            <<<<<<< Side #1 (Conflict 2 of 2)\n\
            line2a\n\
            ||||||| Base\n\
            line2b\n\
            =======\n\
            line2c\n\
            >>>>>>> Side #2 (Conflict 2 of 2 ends)";

        let regions = parse_conflict_markers(content, "multi-jj-git.txt");
        assert_eq!(regions.len(), 2);
        assert_eq!(regions[0].conflict_number, 1);
        assert_eq!(regions[0].total_conflicts, 2);
        assert_eq!(regions[0].marker_style, "git");
        assert_eq!(regions[1].conflict_number, 2);
        assert_eq!(regions[1].total_conflicts, 2);
        assert_eq!(regions[1].marker_style, "git");
    }

    #[test]
    fn parse_pure_git_diff3() {
        let content = "normal line\n\
            <<<<<<< \"commit A\"\n\
            apple grapefruit orange\n\
            ||||||| \"merge base\"\n\
            apple grape orange\n\
            =======\n\
            APPLE GRAPE ORANGE\n\
            >>>>>>> \"commit B\"\n\
            more normal";

        let regions = parse_conflict_markers(content, "git.txt");
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].conflict_number, 1);
        assert_eq!(regions[0].total_conflicts, 0);
        assert_eq!(regions[0].start_line, 2);
        assert_eq!(regions[0].end_line, 8);
        assert_eq!(regions[0].marker_style, "git");
        assert!(regions[0].content.contains("|||||||"));
        assert!(regions[0].content.contains("======="));
    }

    #[test]
    fn parse_pure_git_diff3_multiple() {
        let content = "<<<<<<< \"commit A\"\n\
            line1a\n\
            ||||||| \"base\"\n\
            line1b\n\
            =======\n\
            line1c\n\
            >>>>>>> \"commit B\"\n\
            middle\n\
            <<<<<<< \"commit A\"\n\
            line2a\n\
            ||||||| \"base\"\n\
            line2b\n\
            =======\n\
            line2c\n\
            >>>>>>> \"commit B\"";

        let regions = parse_conflict_markers(content, "multi-git.txt");
        assert_eq!(regions.len(), 2);
        assert_eq!(regions[0].marker_style, "git");
        assert_eq!(regions[1].marker_style, "git");
    }

    #[test]
    fn parse_empty_content() {
        let regions = parse_conflict_markers("", "empty.txt");
        assert!(regions.is_empty());
    }

    #[test]
    fn parse_no_conflicts() {
        let content = "just normal code\nno conflicts here\n";
        let regions = parse_conflict_markers(content, "clean.txt");
        assert!(regions.is_empty());
    }
}
