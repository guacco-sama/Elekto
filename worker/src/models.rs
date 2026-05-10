use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

/// Core track entity - all metadata for a single audio file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: i64,
    pub file_path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub bpm: Option<f64>,
    pub key: Option<String>,
    pub camelot_key: Option<String>,
    pub energy: Option<i32>,
    pub danceability: Option<i32>,
    pub emotion: Option<String>,
    pub genre: Option<String>,
    pub sub_genre: Option<String>,
    pub duration_ms: Option<i64>,
    pub sample_rate: Option<i32>,
    pub bitrate: Option<i32>,
    pub file_size_bytes: Option<i64>,
    pub cover_art_path: Option<String>,
    pub analyzed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Feature vector for ML similarity and spatial projection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackFeatures {
    pub track_id: i64,
    /// 128-dimensional embedding as JSON array string
    pub embedding: String,
    pub spectral_centroid: Option<f64>,
    pub spectral_rolloff: Option<f64>,
    pub zero_crossing_rate: Option<f64>,
    pub rms_energy: Option<f64>,
}

/// DJ set chapter - a group of tracks with shared energy/character
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub energy_target: Option<i32>,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
}

/// Track within a chapter with ordering and notes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterTrack {
    pub chapter_id: i64,
    pub track_id: i64,
    pub position: i32,
    pub transition_notes: Option<String>,
}

/// Pre-computed compatibility between two tracks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackEdge {
    pub source_id: i64,
    pub target_id: i64,
    pub compatibility_score: f64,
    pub harmonic_match: bool,
    pub energy_flow: bool,
}

/// Update payload for track metadata (editable fields)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TrackUpdate {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub bpm: Option<f64>,
    pub key: Option<String>,
    pub camelot_key: Option<String>,
    pub energy: Option<i32>,
    pub danceability: Option<i32>,
    pub emotion: Option<String>,
    pub genre: Option<String>,
    pub sub_genre: Option<String>,
    pub tags: Option<Vec<String>>,
}

/// Scan result from folder traversal
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub path: String,
    pub tracks_found: usize,
    pub tracks_imported: usize,
    pub errors: Vec<String>,
}

/// Analysis result from audio processing pipeline
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub track_id: i64,
    pub bpm: f64,
    pub key: String,
    pub camelot_key: String,
    pub energy: i32,
    pub danceability: i32,
    pub emotion: String,
    pub genre: String,
    pub sub_genre: String,
    pub features: TrackFeatures,
}

/// Rekordbox export configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RekordboxExport {
    pub chapter_ids: Vec<i64>,
    pub output_path: String,
    pub include_cue_points: bool,
    pub include_loops: bool,
}
