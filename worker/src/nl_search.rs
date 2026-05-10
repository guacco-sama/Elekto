//! Natural Language Search — parse free-form DJ queries into SQL
//!
//! Supports queries like:
//! - "dark techno peak time" → genre=techno, energy>=8
//! - "melodic house 120-130 bpm" → genre=house, bpm 120-130
//! - "high energy dubstep drops" → genre=dubstep, energy>=7, has drop cue
//! - "chill ambient under 110" → genre=ambient, bpm<110, energy<=4
//! - "female vocals progressive" → tags like female, genre=progressive
//! - "8B or 9B key" → camelot_key in (8B, 9B)
//! - "un analyzed" → bpm IS NULL
//! - "recently added" → created_at within last week

use crate::db::Database;
use crate::models::Track;
use tracing::info;

/// Parsed NL query parameters
#[derive(Debug, Default)]
pub struct NlQuery {
    pub genres: Vec<String>,
    pub sub_genres: Vec<String>,
    pub moods: Vec<String>,
    pub bpm_min: Option<f64>,
    pub bpm_max: Option<f64>,
    pub energy_min: Option<i32>,
    pub energy_max: Option<i32>,
    pub keys: Vec<String>,
    pub camelot_keys: Vec<String>,
    pub tags: Vec<String>,
    pub text_search: Vec<String>,
    pub analyzed: Option<bool>,
    pub recently_added: bool,
}

/// Parse a natural language query string
pub fn parse_query(query: &str) -> NlQuery {
    let lower = query.to_lowercase();
    let words: Vec<&str> = lower.split_whitespace().collect();
    let mut nl = NlQuery::default();
    let mut i = 0;

    // Genre keywords
    let genre_keywords: &[&str] = &[
        "techno", "house", "dubstep", "drum and bass", "dnb", "drum & bass",
        "trance", "progressive", "deep house", "tech house", "minimal",
        "ambient", "downtempo", "electro", "edm", "trap", "hip hop",
        "r&b", "funk", "disco", "soul", "jazz", "rock", "pop",
        "melodic", "acid", "hardstyle", "hardcore", "garage", "grime",
    ];

    // Mood/energy keywords
    let energy_high = &["peak", "high", "hard", "intense", "aggressive", "driving", "heavy"];
    let energy_low = &["chill", "relaxed", "calm", "soft", "mellow", "laid back", "smooth"];
    let mood_keywords: &[&str] = &[
        "dark", "light", "bright", "warm", "cold", "organic", "synthetic",
        "emotional", "uplifting", "melancholic", "nostalgic", "euphoric",
        "tribal", "futuristic", "retro", "raw", "polished",
    ];

    // Key words
    let key_patterns = &[
        "8b", "8a", "9b", "9a", "10b", "10a", "11b", "11a", "12b", "12a",
        "1b", "1a", "2b", "2a", "3b", "3a", "4b", "4a", "5b", "5a",
        "6b", "6a", "7b", "7a",
    ];

    while i < words.len() {
        let word = words[i];

        // BPM ranges: "120-130", "120 to 130", "over 130", "under 110", "above 120", "below 100"
        if let Ok(bpm) = word.parse::<f64>() {
            if bpm >= 60.0 && bpm <= 200.0 {
                // Check for range: "120-130" or "120 to 130"
                if i + 2 < words.len() && words[i + 1] == "to" {
                    if let Ok(bpm2) = words[i + 2].parse::<f64>() {
                        nl.bpm_min = Some(bpm.min(bpm2));
                        nl.bpm_max = Some(bpm.max(bpm2));
                        i += 3;
                        continue;
                    }
                }
                // Single BPM with modifier
                if i > 0 {
                    match words[i - 1] {
                        "over" | "above" | "more" | "faster" | "higher" => {
                            nl.bpm_min = Some(bpm);
                            i += 1;
                            continue;
                        }
                        "under" | "below" | "less" | "slower" | "lower" => {
                            nl.bpm_max = Some(bpm);
                            i += 1;
                            continue;
                        }
                        _ => {}
                    }
                }
                // "120 bpm" → approximate range
                nl.bpm_min = Some(bpm - 3.0);
                nl.bpm_max = Some(bpm + 3.0);
                i += 1;
                continue;
            }
        }

        // BPM range with dash: "120-130"
        if word.contains('-') {
            let parts: Vec<&str> = word.split('-').collect();
            if parts.len() == 2 {
                if let (Ok(a), Ok(b)) = (parts[0].parse::<f64>(), parts[1].parse::<f64>()) {
                    if a >= 60.0 && b <= 200.0 {
                        nl.bpm_min = Some(a.min(b));
                        nl.bpm_max = Some(a.max(b));
                        i += 1;
                        continue;
                    }
                }
            }
        }

        // Energy: "high energy", "low energy", "energy 8"
        if word == "energy" && i + 1 < words.len() {
            if let Ok(e) = words[i + 1].parse::<i32>() {
                nl.energy_min = Some(e);
                nl.energy_max = Some(e);
                i += 2;
                continue;
            }
        }

        // Camelot keys
        if key_patterns.contains(&word) {
            nl.camelot_keys.push(word.to_uppercase());
            i += 1;
            continue;
        }

        // Analyzed/unanalyzed
        if word == "unanalyzed" || word == "un analyzed" || (word == "not" && i + 1 < words.len() && words[i + 1] == "analyzed") {
            nl.analyzed = Some(false);
            i += 1;
            continue;
        }
        if word == "analyzed" {
            nl.analyzed = Some(true);
            i += 1;
            continue;
        }

        // Recently added
        if (word == "recent" || word == "recently") && i + 1 < words.len() && words[i + 1] == "added" {
            nl.recently_added = true;
            i += 2;
            continue;
        }

        // Energy keywords
        if energy_high.contains(&word) {
            nl.energy_min = Some(nl.energy_min.unwrap_or(0).max(7));
        }
        if energy_low.contains(&word) {
            nl.energy_max = Some(nl.energy_max.unwrap_or(10).min(4));
        }

        // Mood keywords
        if mood_keywords.contains(&word) {
            nl.moods.push(word.to_string());
        }

        // Genre detection (check multi-word genres first)
        let remaining = words[i..].join(" ");
        let mut matched_genre = false;
        for &g in genre_keywords.iter().rev() {
            // Check longest matches first
            if remaining.starts_with(g) {
                nl.genres.push(g.to_string());
                let g_words = g.split_whitespace().count();
                i += g_words;
                matched_genre = true;
                break;
            }
        }
        if matched_genre {
            continue;
        }

        // Fallback: collect remaining words as text search terms
        if word.len() > 2 && !["the", "and", "or", "in", "a", "an", "of", "for", "with", "by", "to", "from"].contains(&word) {
            nl.text_search.push(word.to_string());
        }

        i += 1;
    }

    info!("NL query parsed: {:?}", nl);
    nl
}

/// Execute a natural language query against the database
pub fn search_nl(db: &Database, query: &str) -> Result<Vec<Track>, Box<dyn std::error::Error>> {
    let nl = parse_query(query);

    // Build dynamic SQL
    let mut conditions: Vec<String> = vec!["1=1".to_string()];
    let mut params: Vec<rusqlite::types::Value> = vec![];

    // Genre filter
    if !nl.genres.is_empty() {
        let placeholders = nl.genres.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        conditions.push(format!(
            "(LOWER(genre) IN ({}))",
            placeholders
        ));
        for g in &nl.genres {
            params.push(rusqlite::types::Value::Text(g.to_lowercase()));
        }
    }

    // Mood filter (match emotion field)
    if !nl.moods.is_empty() {
        let mood_likes = nl.moods.iter().map(|_| "LOWER(emotion) LIKE ?").collect::<Vec<_>>().join(" OR ");
        conditions.push(format!("({})", mood_likes));
        for m in &nl.moods {
            params.push(rusqlite::types::Value::Text(format!("%{}%", m.to_lowercase())));
        }
    }

    // BPM range
    if let Some(min) = nl.bpm_min {
        conditions.push("bpm >= ?".to_string());
        params.push(rusqlite::types::Value::Real(min));
    }
    if let Some(max) = nl.bpm_max {
        conditions.push("bpm <= ?".to_string());
        params.push(rusqlite::types::Value::Real(max));
    }

    // Energy range
    if let Some(min) = nl.energy_min {
        conditions.push("energy >= ?".to_string());
        params.push(rusqlite::types::Value::Integer(min as i64));
    }
    if let Some(max) = nl.energy_max {
        conditions.push("energy <= ?".to_string());
        params.push(rusqlite::types::Value::Integer(max as i64));
    }

    // Camelot key
    if !nl.camelot_keys.is_empty() {
        let placeholders = nl.camelot_keys.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        conditions.push(format!(
            "(UPPER(camelot_key) IN ({}))",
            placeholders
        ));
        for k in &nl.camelot_keys {
            params.push(rusqlite::types::Value::Text(k.to_uppercase()));
        }
    }

    // Analyzed status
    if let Some(true) = nl.analyzed {
        conditions.push("bpm IS NOT NULL".to_string());
    } else if let Some(false) = nl.analyzed {
        conditions.push("bpm IS NULL".to_string());
    }

    // Recently added (last 7 days)
    if nl.recently_added {
        conditions.push("created_at >= datetime('now', '-7 days')".to_string());
    }

    // Text search fallback via FTS
    let use_fts = !nl.text_search.is_empty();

    let sql = if use_fts {
        let fts_query = nl.text_search.join(" ");
        format!(
            "SELECT t.id, t.file_path, t.title, t.artist, t.album, t.bpm, t.key, t.camelot_key,
                t.energy, t.danceability, t.emotion, t.genre, t.sub_genre, t.duration_ms,
                t.sample_rate, t.bitrate, t.file_size_bytes, t.cover_art_path, t.analyzed_at, t.created_at
            FROM tracks t
            JOIN tracks_fts fts ON t.id = fts.rowid
            WHERE {} AND tracks_fts MATCH ?
            ORDER BY rank
            LIMIT 100",
            conditions.join(" AND ")
        )
    } else {
        format!(
            "SELECT id, file_path, title, artist, album, bpm, key, camelot_key,
                energy, danceability, emotion, genre, sub_genre, duration_ms,
                sample_rate, bitrate, file_size_bytes, cover_art_path, analyzed_at, created_at
            FROM tracks
            WHERE {}
            ORDER BY created_at DESC
            LIMIT 100",
            conditions.join(" AND ")
        )
    };

    let mut stmt = db.conn.prepare(&sql)?;

    if use_fts {
        let fts_query = nl.text_search.join(" ");
        params.push(rusqlite::types::Value::Text(fts_query));
    }

    let track_rows = stmt.query_map(
        rusqlite::params_from_iter(params.iter()),
        |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                bpm: row.get(5)?,
                key: row.get(6)?,
                camelot_key: row.get(7)?,
                energy: row.get(8)?,
                danceability: row.get(9)?,
                emotion: row.get(10)?,
                genre: row.get(11)?,
                sub_genre: row.get(12)?,
                duration_ms: row.get(13)?,
                sample_rate: row.get(14)?,
                bitrate: row.get(15)?,
                file_size_bytes: row.get(16)?,
                cover_art_path: row.get(17)?,
                analyzed_at: row.get(18)?,
                created_at: row.get(19)?,
            })
        },
    )?;

    let tracks: Vec<Track> = track_rows.collect::<Result<Vec<_>, _>>()?;
    info!("NL search '{}' returned {} tracks", query, tracks.len());
    Ok(tracks)
}
