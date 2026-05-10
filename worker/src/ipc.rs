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

    /// Natural language search tracks
    SearchNL {
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

    /// Remove track from chapter
    RemoveTrackFromChapter {
        id: String,
        chapter_id: i64,
        track_id: i64,
    },

    /// Delete a chapter
    DeleteChapter {
        id: String,
        chapter_id: i64,
    },

    /// Get tracks in a chapter
    GetChapterTracks {
        id: String,
        chapter_id: i64,
    },

    /// Auto-sort tracks in a chapter by energy flow / harmonic compatibility
    SortChapter {
        id: String,
        chapter_id: i64,
        strategy: String, // "energy_flow", "harmonic", "bpm_ramp", "random"
    },

    /// Export chapters to Rekordbox XML
    ExportRekordbox {
        id: String,
        chapter_ids: Vec<i64>,
        output_path: String,
    },

    /// Export chapters to Engine Prime library
    ExportEnginePrime {
        id: String,
        chapter_ids: Vec<i64>,
        output_path: String,
    },

    /// Get all settings
    GetSettings {
        id: String,
    },

    /// Get a single setting value
    GetSetting {
        id: String,
        key: String,
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

    /// Analyze a single track (audio feature extraction)
    AnalyzeTrack {
        id: String,
        track_id: i64,
    },

    /// Auto-tag a track using LLM (genre, sub-genre, mood refinement)
    AutoTagTrack {
        id: String,
        track_id: i64,
    },

    /// Analyze multiple tracks in parallel with progress
    AnalyzeAll {
        id: String,
        track_ids: Vec<i64>,
        threads: Option<usize>,
    },

    /// Check if LLM model is downloaded and ready
    ModelStatus {
        id: String,
    },

    /// Get waveform + beat-grid data for a track
    GetWaveform {
        id: String,
        track_id: i64,
        pixel_width: Option<usize>,
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

    /// Single config value response
    ConfigValue {
        id: String,
        key: String,
        value: Option<String>,
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

    /// Auto-tagging complete
    AutoTagComplete {
        id: String,
        track_id: i64,
        tags: TrackUpdate,
    },

    /// Model status
    ModelStatus {
        id: String,
        ready: bool,
        model_name: String,
        downloaded: bool,
    },

    /// Waveform + beat-grid + cue points data
    WaveformData {
        id: String,
        track_id: i64,
        waveform_json: String,
        beatgrid_json: String,
        cues_json: String,
    },

    /// Chapter tracks response
    ChapterTracks {
        id: String,
        chapter_id: i64,
        track_ids: Vec<i64>,
    },

    /// Chapter sorted (new order)
    ChapterSorted {
        id: String,
        chapter_id: i64,
        track_ids: Vec<i64>,
    },

    /// Error response
    Error {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<String>,
        message: String,
    },
}
