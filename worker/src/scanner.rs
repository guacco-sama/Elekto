use std::path::Path;
use walkdir::WalkDir;
use tracing::{info, warn};

use crate::models::Track;

/// Supported audio file extensions
const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "wav", "aiff", "m4a", "aac", "ogg", "opus", "wma",
];

/// Scan a folder recursively for audio files and extract metadata
pub async fn scan_folder<P: AsRef<Path>>(path: P) -> Result<Vec<Track>, ScannerError> {
    let path = path.as_ref();
    info!("Starting scan of: {}", path.display());

    let mut tracks = Vec::new();
    let mut files_scanned = 0;

    for entry in WalkDir::new(path)
        .follow_links(false)
        .max_depth(20)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let entry_path = entry.path();

        if !entry_path.is_file() {
            continue;
        }

        // Check if file has a supported audio extension
        let ext = entry_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());

        let is_audio = ext.as_ref()
            .map(|e| AUDIO_EXTENSIONS.contains(&e.as_str()))
            .unwrap_or(false);

        if !is_audio {
            continue;
        }

        files_scanned += 1;

        // Try to read metadata
        match read_audio_metadata(entry_path).await {
            Ok(track) => {
                tracks.push(track);
            }
            Err(e) => {
                warn!("Failed to read metadata for {}: {}", entry_path.display(), e);
            }
        }
    }

    info!(
        "Scan complete: {} files scanned, {} tracks imported",
        files_scanned,
        tracks.len()
    );

    Ok(tracks)
}

/// Read metadata from a single audio file using lofty
async fn read_audio_metadata(path: &Path) -> Result<Track, ScannerError> {
    use lofty::probe::Probe;
    use lofty::prelude::*;
    use std::fs;

    let tagged_file = Probe::open(path)?
        .read()?;

    let properties = tagged_file.properties();
    let tag = tagged_file.primary_tag();

    let title = tag.and_then(|t| t.title().map(|s| s.to_string()));
    let artist = tag.and_then(|t| t.artist().map(|s| s.to_string()));
    let album = tag.and_then(|t| t.album().map(|s| s.to_string()));
    let genre = tag.and_then(|t| t.genre().map(|s| s.to_string()));

    let duration_ms = properties.duration().as_millis() as i64;
    let sample_rate = properties.sample_rate().map(|r| r as i32);
    let bitrate = properties.audio_bitrate().map(|b| b as i32);

    let file_size_bytes = fs::metadata(path)
        .map(|m| m.len() as i64)
        .ok();

    // Extract BPM from tags if present (Rekordbox, Traktor store BPM in tags)
    let bpm = tag.and_then(|t| {
        t.get_string(&lofty::tag::ItemKey::Bpm)
            .and_then(|s| s.parse::<f64>().ok())
    });

    // Extract key from tags
    let key = tag.and_then(|t| {
        t.get_string(&lofty::tag::ItemKey::InitialKey)
            .map(|s| s.to_string())
    });

    let track = Track {
        id: 0, // Will be set by database
        file_path: path.to_string_lossy().to_string(),
        title,
        artist,
        album,
        bpm,
        key,
        camelot_key: None,
        energy: None,
        danceability: None,
        emotion: None,
        genre,
        sub_genre: None,
        duration_ms: Some(duration_ms),
        sample_rate,
        bitrate,
        file_size_bytes,
        cover_art_path: None,
        analyzed_at: None,
        created_at: chrono::Utc::now(),
    };

    Ok(track)
}

/// Errors that can occur during scanning
#[derive(Debug, thiserror::Error)]
pub enum ScannerError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Audio metadata error: {0}")]
    Metadata(#[from] lofty::error::LoftyError),

    #[error("Invalid file path")]
    InvalidPath,
}