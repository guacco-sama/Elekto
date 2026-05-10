//! Magic Sort — auto-order chapter tracks by DJ-friendly strategies
//!
//! Strategies:
//! - energy_flow:   Build energy progressively (valley → peak), DJ set arc
//! - harmonic:      Group by compatible keys (Camelot wheel), minimize tonal clashes
//! - bpm_ramp:      Gradual BPM increase/decrease, no jarring jumps
//! - random:        Shuffle (for discovery)

use crate::db::Database;
use crate::models::Track;
use tracing::info;

/// Sort tracks in a chapter by the given strategy. Returns the new ordered track IDs.
pub fn sort_tracks(
    db: &Database,
    chapter_id: i64,
    strategy: &str,
) -> Result<Vec<i64>, Box<dyn std::error::Error>> {
    let track_ids = db.get_chapter_tracks(chapter_id)?;
    if track_ids.len() < 2 {
        return Ok(track_ids);
    }

    // Fetch full track data
    let mut tracks: Vec<(i64, Track)> = track_ids
        .iter()
        .filter_map(|&id| db.get_track(id).ok().flatten().map(|t| (id, t)))
        .collect();

    let sorted = match strategy {
        "energy_flow" => sort_energy_flow(&mut tracks),
        "harmonic" => sort_harmonic(&mut tracks),
        "bpm_ramp" => sort_bpm_ramp(&mut tracks),
        "random" => {
            use rand::seq::SliceRandom;
            let mut rng = rand::thread_rng();
            tracks.shuffle(&mut rng);
            tracks.into_iter().map(|(id, _)| id).collect()
        }
        _ => tracks.into_iter().map(|(id, _)| id).collect(),
    };

    info!(
        "Sorted chapter {} with '{}' strategy: {} tracks",
        chapter_id,
        strategy,
        sorted.len()
    );

    Ok(sorted)
}

/// Energy flow: build from low energy → peak → cool down (DJ set arc)
/// Uses energy as primary sort key. For tracks without energy, falls back to BPM.
fn sort_energy_flow(tracks: &mut [(i64, Track)]) -> Vec<i64> {
    tracks.sort_by(|a, b| {
        let e_a = a.1.energy.unwrap_or_else(|| a.1.bpm.map(|b| (b / 20.0) as i32).unwrap_or(50));
        let e_b = b.1.energy.unwrap_or_else(|| b.1.bpm.map(|b| (b / 20.0) as i32).unwrap_or(50));
        e_a.cmp(&e_b)
    });
    tracks.iter().map(|(id, _)| *id).collect()
}

/// Camelot key to numeric position on the wheel (0-23)
fn camelot_to_wheel(camelot: &str) -> Option<i32> {
    let map: std::collections::HashMap<&str, i32> = [
        ("8B", 0), ("9B", 2), ("10B", 4), ("11B", 6), ("12B", 8),
        ("1B", 10), ("2B", 12), ("3B", 14), ("4B", 16), ("5B", 18), ("6B", 20), ("7B", 22),
        ("8A", 1), ("9A", 3), ("10A", 5), ("11A", 7), ("12A", 9),
        ("1A", 11), ("2A", 13), ("3A", 15), ("4A", 17), ("5A", 19), ("6A", 21), ("7A", 23),
    ].iter().cloned().collect();
    map.get(camelot).copied()
}

/// Harmonic distance on Camelot wheel (0 = same, 1 = adjacent, 2 = +2/-2, etc.)
fn harmonic_distance(a: &str, b: &str) -> i32 {
    let pos_a = camelot_to_wheel(a).unwrap_or(0);
    let pos_b = camelot_to_wheel(b).unwrap_or(0);
    let diff = (pos_a - pos_b).abs();
    // Wheel wraps at 24, but also consider same letter (major/minor) preference
    let wheel_dist = diff.min(24 - diff);
    wheel_dist
}

/// Greedy harmonic sort: start with first track, then always pick the most harmonically compatible next track
fn sort_harmonic(tracks: &mut [(i64, Track)]) -> Vec<i64> {
    if tracks.is_empty() {
        return vec![];
    }

    // Separate tracks with and without camelot keys
    let mut with_key: Vec<(i64, Track)> = tracks
        .iter()
        .filter(|(_, t)| t.camelot_key.is_some())
        .cloned()
        .collect();
    let without_key: Vec<(i64, Track)> = tracks
        .iter()
        .filter(|(_, t)| t.camelot_key.is_none())
        .cloned()
        .collect();

    if with_key.is_empty() {
        // Fall back to BPM sort
        return sort_bpm_ramp(tracks);
    }

    let mut sorted = vec![];

    // Start with the track that has the most common key (mode of the set)
    let mut key_counts = std::collections::HashMap::new();
    for (_, t) in &with_key {
        *key_counts.entry(t.camelot_key.clone().unwrap()).or_insert(0) += 1;
    }
    let start_key = key_counts.into_iter().max_by_key(|(_, c)| *c).map(|(k, _)| k).unwrap_or_else(|| "8B".to_string());

    // Find the track closest to start_key
    let start_idx = with_key
        .iter()
        .enumerate()
        .min_by_key(|(_, (_, t))| {
            harmonic_distance(&t.camelot_key.clone().unwrap_or_default(), &start_key)
        })
        .map(|(i, _)| i)
        .unwrap_or(0);

    sorted.push(with_key.remove(start_idx).0);

    // Greedy: always pick the remaining track with the smallest harmonic distance to the last placed track
    while !with_key.is_empty() {
        let last_key = tracks
            .iter()
            .find(|(id, _)| *id == sorted[sorted.len() - 1])
            .and_then(|(_, t)| t.camelot_key.clone())
            .unwrap_or_else(|| "8B".to_string());

        let next_idx = with_key
            .iter()
            .enumerate()
            .min_by_key(|(_, (_, t))| {
                harmonic_distance(&t.camelot_key.clone().unwrap_or_default(), &last_key)
            })
            .map(|(i, _)| i)
            .unwrap_or(0);

        sorted.push(with_key.remove(next_idx).0);
    }

    // Append tracks without keys at the end
    for (id, _) in without_key {
        sorted.push(id);
    }

    sorted
}

/// BPM ramp: gradual increase, with small variance tolerance for grouping similar BPMs
fn sort_bpm_ramp(tracks: &mut [(i64, Track)]) -> Vec<i64> {
    tracks.sort_by(|a, b| {
        let bpm_a = a.1.bpm.unwrap_or(128.0);
        let bpm_b = b.1.bpm.unwrap_or(128.0);
        bpm_a.partial_cmp(&bpm_b).unwrap_or(std::cmp::Ordering::Equal)
    });
    tracks.iter().map(|(id, _)| *id).collect()
}
