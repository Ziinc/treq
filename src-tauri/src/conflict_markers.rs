use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConflictStyle {
    JjDiff,
    JjSnapshot,
    JjGitDiff3,
    GitMerge,
    GitDiff3,
    Unknown,
}

impl Default for ConflictStyle {
    fn default() -> Self {
        Self::Unknown
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConflictLineKind {
    Marker,
    Content,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConflictLineRole {
    Start,
    Base,
    Separator,
    End,
    Left,
    Right,
    Unknown,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConflictLineView {
    pub raw: String,
    pub kind: ConflictLineKind,
    pub role: ConflictLineRole,
    pub file_line: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConflictComparisonView {
    pub left_line_indexes: Vec<usize>,
    pub base_line_indexes: Vec<usize>,
    pub right_line_indexes: Vec<usize>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConflictRegionView {
    pub id: String,
    pub file_path: String,
    pub conflict_number: usize,
    pub total_conflicts: usize,
    pub start_line: usize,
    pub end_line: usize,
    pub marker_style: ConflictStyle,
    pub content: String,
    pub lines: Vec<ConflictLineView>,
    pub line_map: Vec<usize>,
    pub comparison: ConflictComparisonView,
}

pub type ConflictRegion = ConflictRegionView;

fn extract_conflict_info(line: &str) -> Option<(usize, usize)> {
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

    Some((num, total))
}

fn classify_style(content: &str, start_marker: &str) -> ConflictStyle {
    let has_percent = content
        .lines()
        .any(|l| l.trim_start().starts_with("%%%%%%%"));
    let has_pipe = content
        .lines()
        .any(|l| l.trim_start().starts_with("|||||||"));
    let has_equal = content
        .lines()
        .any(|l| l.trim_start().starts_with("======="));
    let has_plus = content
        .lines()
        .any(|l| l.trim_start().starts_with("+++++++"));
    let has_minus = content
        .lines()
        .any(|l| l.trim_start().starts_with("-------"));
    let has_side = start_marker.contains("Side #");

    if has_percent {
        ConflictStyle::JjDiff
    } else if has_plus && has_minus {
        ConflictStyle::JjSnapshot
    } else if has_side && has_pipe && has_equal {
        ConflictStyle::JjGitDiff3
    } else if has_pipe && has_equal {
        ConflictStyle::GitDiff3
    } else if has_equal {
        ConflictStyle::GitMerge
    } else {
        ConflictStyle::Unknown
    }
}

fn marker_role(line: &str) -> Option<ConflictLineRole> {
    let trimmed = line.trim_start();
    if trimmed.starts_with("<<<<<<<") {
        Some(ConflictLineRole::Start)
    } else if trimmed.starts_with("|||||||") || trimmed.starts_with("-------") {
        Some(ConflictLineRole::Base)
    } else if trimmed.starts_with("=======")
        || trimmed.starts_with("%%%%%%%")
        || trimmed.starts_with("+++++++")
    {
        Some(ConflictLineRole::Separator)
    } else if trimmed.starts_with(">>>>>>>") {
        Some(ConflictLineRole::End)
    } else {
        None
    }
}

pub fn parse_conflict_markers(content: &str, file_path: &str) -> Vec<ConflictRegionView> {
    let lines: Vec<&str> = content.split('\n').collect();
    let mut regions = Vec::new();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i];
        if !line.trim_start().starts_with("<<<<<<<") {
            i += 1;
            continue;
        }

        let start_line = i + 1;
        let (conflict_number, total_conflicts) =
            extract_conflict_info(line).unwrap_or((regions.len() + 1, 0));

        let mut end_line = start_line;
        let mut block_lines: Vec<&str> = vec![line];
        let mut j = i + 1;
        while j < lines.len() {
            block_lines.push(lines[j]);
            if lines[j].trim_start().starts_with(">>>>>>>") {
                end_line = j + 1;
                i = j;
                break;
            }
            j += 1;
        }

        let block_content = block_lines.join("\n");
        let style = classify_style(&block_content, line);

        let mut line_views = Vec::new();
        let mut left_line_indexes = Vec::new();
        let mut base_line_indexes = Vec::new();
        let mut right_line_indexes = Vec::new();
        let mut line_map = Vec::new();

        let mut section = ConflictLineRole::Left;
        for (idx, raw) in block_lines.iter().enumerate() {
            let file_line = start_line + idx;
            line_map.push(file_line);
            let role = if let Some(marker) = marker_role(raw) {
                match marker {
                    ConflictLineRole::Start => section = ConflictLineRole::Left,
                    ConflictLineRole::Base => section = ConflictLineRole::Base,
                    ConflictLineRole::Separator => {
                        section = ConflictLineRole::Right;
                    }
                    ConflictLineRole::End
                    | ConflictLineRole::Left
                    | ConflictLineRole::Right
                    | ConflictLineRole::Unknown => {}
                }
                marker
            } else {
                section
            };
            let kind = if marker_role(raw).is_some() {
                ConflictLineKind::Marker
            } else {
                ConflictLineKind::Content
            };
            if kind == ConflictLineKind::Content {
                match section {
                    ConflictLineRole::Left => left_line_indexes.push(idx),
                    ConflictLineRole::Base => base_line_indexes.push(idx),
                    ConflictLineRole::Right => right_line_indexes.push(idx),
                    _ => {}
                }
            }
            line_views.push(ConflictLineView {
                raw: (*raw).to_string(),
                kind,
                role,
                file_line,
            });
        }

        regions.push(ConflictRegionView {
            id: format!("{}-conflict-{}", file_path, conflict_number),
            file_path: file_path.to_string(),
            conflict_number,
            total_conflicts,
            start_line,
            end_line,
            marker_style: style,
            content: block_content,
            lines: line_views,
            line_map,
            comparison: ConflictComparisonView {
                left_line_indexes,
                base_line_indexes,
                right_line_indexes,
            },
        });

        i += 1;
    }

    regions
}
