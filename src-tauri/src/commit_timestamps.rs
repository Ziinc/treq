//! Plan author-timestamp rewrites so a mutable commit can move in time
//! without creating a parent-after-child timestamp history.

use chrono::{NaiveDate, TimeZone};

/// Minimum gap applied when two original timestamps are equal or inverted.
pub const MIN_TIMESTAMP_GAP_MS: i64 = 1_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TimestampShift {
  Offset { days: i64, hours: i64, minutes: i64 },
  ToDay { year: i32, month: u32, day: u32 },
}

/// Compute new timestamps for `[target, descendant...]` (oldest → newest).
///
/// `new_target_millis` is the requested author time for the target. Each later
/// commit keeps its original time when it is still strictly after its
/// predecessor; otherwise it is shifted by the original interval from that
/// predecessor (at least [`MIN_TIMESTAMP_GAP_MS`]). The caller must reject a
/// target that would land at or before `parent_millis`.
pub fn plan_lineage_timestamps(
  original_millis: &[i64],
  new_target_millis: i64,
  parent_millis: Option<i64>,
) -> Vec<i64> {
  let _ = parent_millis;

  let mut planned = Vec::with_capacity(original_millis.len());
  planned.push(new_target_millis);

  for index in 1..original_millis.len() {
    let predecessor_new = planned[index - 1];
    let original = original_millis[index];
    if original > predecessor_new {
      planned.push(original);
      continue;
    }

    let original_gap = original_millis[index].saturating_sub(original_millis[index - 1]);
    let gap = original_gap.max(MIN_TIMESTAMP_GAP_MS);
    planned.push(predecessor_new.saturating_add(gap));
  }

  planned
}

pub fn offset_to_millis(days: i64, hours: i64, minutes: i64) -> Option<i64> {
  days
    .checked_mul(86_400_000)?
    .checked_add(hours.checked_mul(3_600_000)?)?
    .checked_add(minutes.checked_mul(60_000)?)
}

pub fn apply_shift_to_millis(
  original_millis: i64,
  tz_offset_minutes: i32,
  shift: &TimestampShift,
) -> Result<i64, String> {
  match shift {
    TimestampShift::Offset {
      days,
      hours,
      minutes,
    } => {
      let offset = offset_to_millis(*days, *hours, *minutes)
        .ok_or_else(|| "Timestamp offset is too large".to_string())?;
      original_millis
        .checked_add(offset)
        .ok_or_else(|| "Timestamp offset overflowed".to_string())
    }
    TimestampShift::ToDay { year, month, day } => {
      let offset = chrono::FixedOffset::east_opt(tz_offset_minutes.saturating_mul(60))
        .ok_or_else(|| "Invalid timezone offset".to_string())?;
      let utc = chrono::Utc
        .timestamp_millis_opt(original_millis)
        .single()
        .ok_or_else(|| "Out-of-range timestamp".to_string())?;
      let local = utc.with_timezone(&offset);
      let date = NaiveDate::from_ymd_opt(*year, *month, *day)
        .ok_or_else(|| format!("Invalid date {year:04}-{month:02}-{day:02}"))?;
      let naive = date.and_time(local.time());
      offset
        .from_local_datetime(&naive)
        .single()
        .map(|dt| dt.timestamp_millis())
        .ok_or_else(|| "Could not place that date in the commit timezone".to_string())
    }
  }
}

/// Add the same delta to every timestamp on a lineage (oldest → newest).
pub fn plan_uniform_lineage_shift(original_millis: &[i64], delta_millis: i64) -> Vec<i64> {
  original_millis
    .iter()
    .map(|millis| millis.saturating_add(delta_millis))
    .collect()
}

/// Newest non-empty commit in oldest → newest order. Empty working copies are
/// skipped so "shift to now" lands on the last real commit.
pub fn newest_real_commit_index(empty_flags: &[bool]) -> Option<usize> {
  empty_flags
    .iter()
    .rposition(|is_empty| !*is_empty)
    .or_else(|| empty_flags.last().map(|_| empty_flags.len() - 1))
}

pub fn parse_day(value: &str) -> Result<(i32, u32, u32), String> {
  let trimmed = value.trim();
  let parts: Vec<&str> = trimmed.split('-').collect();
  if parts.len() != 3 {
    return Err("Date must be YYYY-MM-DD".to_string());
  }
  let year: i32 = parts[0]
    .parse()
    .map_err(|_| "Date must be YYYY-MM-DD".to_string())?;
  let month: u32 = parts[1]
    .parse()
    .map_err(|_| "Date must be YYYY-MM-DD".to_string())?;
  let day: u32 = parts[2]
    .parse()
    .map_err(|_| "Date must be YYYY-MM-DD".to_string())?;
  NaiveDate::from_ymd_opt(year, month, day).ok_or_else(|| format!("Invalid date {trimmed}"))?;
  Ok((year, month, day))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn shifts_descendants_that_would_be_older_preserving_gaps() {
    let planned = plan_lineage_timestamps(&[1_000, 2_000, 4_000], 10_000, None);
    assert_eq!(planned, vec![10_000, 11_000, 13_000]);
  }

  #[test]
  fn leaves_descendants_that_stay_newer_unchanged() {
    let planned = plan_lineage_timestamps(&[1_000, 5_000, 8_000], 2_000, None);
    assert_eq!(planned, vec![2_000, 5_000, 8_000]);
  }

  #[test]
  fn clamps_are_left_to_the_caller() {
    let planned = plan_lineage_timestamps(&[1_000, 2_000], 100, Some(500));
    assert_eq!(planned, vec![100, 2_000]);
  }

  #[test]
  fn equal_original_timestamps_gain_a_minimum_gap() {
    let planned = plan_lineage_timestamps(&[1_000, 1_000], 5_000, None);
    assert_eq!(planned, vec![5_000, 6_000]);
  }

  #[test]
  fn offset_to_millis_combines_units() {
    assert_eq!(
      offset_to_millis(1, 2, 3),
      Some(86_400_000 + 7_200_000 + 180_000)
    );
    assert_eq!(offset_to_millis(-1, 0, 0), Some(-86_400_000));
  }

  #[test]
  fn uniform_shift_preserves_gaps() {
    assert_eq!(
      plan_uniform_lineage_shift(&[1_000, 4_000, 7_000], 10_000),
      vec![11_000, 14_000, 17_000]
    );
  }

  #[test]
  fn newest_real_commit_skips_trailing_empty() {
    assert_eq!(newest_real_commit_index(&[false, false, true]), Some(1));
    assert_eq!(newest_real_commit_index(&[true]), Some(0));
    assert_eq!(newest_real_commit_index(&[]), None);
  }

  #[test]
  fn apply_shift_moves_to_requested_day_keeping_clock_time() {
    // 2024-01-15 15:30:00 +00:00
    let original = 1_705_332_600_000;
    let shifted = apply_shift_to_millis(
      original,
      0,
      &TimestampShift::ToDay {
        year: 2024,
        month: 1,
        day: 20,
      },
    )
    .expect("shift");
    assert_eq!(shifted, 1_705_764_600_000);
  }
}
