use serde::{Deserialize, Serialize};
use crate::models::{Track, Chapter, TrackUpdate};

/// Commands sent from Electron main process to Rust worker via stdin
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Command {
    /// Health check
    Ping { id: String },

    /// Scan a folder for audio files
    ScanFolder {
        id: String,
        path: String,
    },

    /// Get tracks with pagination
    GetTracks {
        id: String,
        limit: Option<usize>,
        offset: Option<usize>,
    },

    /// Full-text search tracks
    SearchTracks {
        id: String,
        query: String,
    },

    /// Update track metadata
    UpdateTrack {
        id: String,
        track_id: i64,
        updates: TrackUpdate,
    },

    /// Delete a track
    DeleteTrack {
        id: String,
        track_id: i64,
    },

    /// Create a new chapter
    CreateChapter {
        id: String,
        name: String,
        description: Option<String>,
        energy_target: Option<i32>,
    },

    /// Get all chapters
    GetChapters {
        id: String,
    },

    /// Add track to chapter
    AddTrackToChapter {
        id: String,
        chapter_id: i64,
        track_id: i64,
        position: i32,
    },

    /// Export chapters to Rekordbox XML
    ExportRekordbox {
        id: String,
        chapter_ids: Vec<i64>,
        output_path: String,
    },

    /// Get all settings
    GetSettings {
        id: String,
    },

    /// Set a setting
    SetSetting {
        id: String,
        key: String,
        value: String,
    },

    /// Download a model from URL
    DownloadModel {
        id: String,
        model_name: String,
        url: String,
    },

    /// Analyze a single track (audio feature extraction + ML tagging)
    AnalyzeTrack {
        id: String,
        track_id: i64,
    },
}

/// Responses sent from Rust worker to Electron main process via stdout
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Response {
    /// Ping response
    Pong { id: String },

    /// Generic success
    Success { id: String },

    /// Scan completed
    ScanComplete {
        id: String,
        track_count: usize,
        tracks: Vec<Track>,
    },

    /// Track list response
    Tracks {
        id: String,
        tracks: Vec<Track>,
        total: usize,
    },

    /// Chapter created
    ChapterCreated {
        id: String,
        chapter_id: i64,
    },

    /// Chapter list response
    Chapters {
        id: String,
        chapters: Vec<Chapter>,
    },

    /// Export completed
    ExportComplete {
        id: String,
        path: String,
    },

    /// Settings response
    Settings {
        id: String,
        settings: Vec<(String, String)>,
    },

    /// Analysis progress/complete
    AnalysisProgress {
        id: String,
        track_id: i64,
        progress: f32,
        status: String,
    },

    /// Analysis complete
    AnalysisComplete {
        id: String,
        track_id: i64,
        tags: TrackUpdate,
    },

    /// Error response
    Error {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<String>,
        message: String,
    },
}
