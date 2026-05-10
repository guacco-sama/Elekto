use std::io::{self, BufRead, Write};

mod db;
mod ipc;
mod models;
mod scanner;

use ipc::{Command, Response};
use tracing::{info, error};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter("info")
        .init();

    info!("DJ Curation Worker v0.1.0 starting...");

    // Initialize database
    let db_path = dirs::data_dir()
        .unwrap_or_else(|| std::env::current_dir().unwrap())
        .join("djcuration")
        .join("db")
        .join("library.db");

    std::fs::create_dir_all(db_path.parent().unwrap())?;
    let db = db::Database::new(&db_path)?;
    info!("Database initialized at {}", db_path.display());

    // Main IPC loop - read JSON Lines from stdin, write JSON Lines to stdout
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }

        let response = match serde_json::from_str::<Command>(&line) {
            Ok(cmd) => handle_command(cmd, &db).await,
            Err(e) => Response::Error {
                id: None,
                message: format!("Failed to parse command: {}", e),
            },
        };

        let response_json = serde_json::to_string(&response)?;
        writeln!(stdout, "{}", response_json)?;
        stdout.flush()?;
    }

    info!("Worker shutting down gracefully");
    Ok(())
}

async fn handle_command(cmd: Command, db: &db::Database) -> Response {
    match cmd {
        Command::Ping { id } => Response::Pong { id },

        Command::ScanFolder { id, path } => {
            info!("Scanning folder: {}", path);
            match scanner::scan_folder(&path).await {
                Ok(tracks) => {
                    let count = tracks.len();
                    // Insert tracks into database
                    for track in &tracks {
                        if let Err(e) = db.insert_track(track) {
                            error!("Failed to insert track {}: {}", track.file_path, e);
                        }
                    }
                    Response::ScanComplete {
                        id,
                        track_count: count,
                        tracks,
                    }
                }
                Err(e) => Response::Error {
                    id: Some(id),
                    message: format!("Scan failed: {}", e),
                },
            }
        }

        Command::GetTracks { id, limit, offset } => {
            match db.get_tracks(limit.unwrap_or(100), offset.unwrap_or(0)) {
                Ok(tracks) => Response::Tracks {
                    id,
                    tracks,
                    total: db.get_track_count().unwrap_or(0),
                },
                Err(e) => Response::Error {
                    id: Some(id),
                    message: format!("Failed to get tracks: {}", e),
                },
            }
        }

        Command::SearchTracks { id, query } => {
            match db.search_tracks(&query) {
                Ok(tracks) => {
                    let total = tracks.len();
                    Response::Tracks {
                        id,
                        tracks,
                        total,
                    }
                },
                Err(e) => Response::Error {
                    id: Some(id),
                    message: format!("Search failed: {}", e),
                },
            }
        }

        Command::UpdateTrack { id, track_id, updates } => {
            match db.update_track(track_id, &updates) {
                Ok(_) => Response::Success { id },
                Err(e) => Response::Error {
                    id: Some(id),
                    message: format!("Update failed: {}", e),
                },
            }
        }

        Command::DeleteTrack { id, track_id } => {
            match db.delete_track(track_id) {
                Ok(_) => Response::Success { id },
                Err(e) => Response::Error {
                    id: Some(id),
                    message: format!("Delete failed: {}", e),
                },
            }
        }

        Command::CreateChapter { id, name, description, energy_target } => {
            let chapter = models::Chapter {
                id: 0, // Will be set by database
                name,
                description,
                energy_target,
                sort_order: 0,
                created_at: chrono::Utc::now(),
            };
            match db.create_chapter(&chapter) {
                Ok(chapter_id) => Response::ChapterCreated {
                    id,
                    chapter_id,
                },
                Err(e) => Response::Error {
                    id: Some(id),
                    message: format!("Failed to create chapter: {}", e),
                },
            }
        }

        Command::GetChapters { id } => {
            match db.get_chapters() {
                Ok(chapters) => Response::Chapters {
                    id,
                    chapters,
                },
                Err(e) => Response::Error {
                    id: Some(id),
                    message: format!("Failed to get chapters: {}", e),
                },
            }
        }

        Command::AddTrackToChapter { id, chapter_id, track_id, position } => {
            match db.add_track_to_chapter(chapter_id, track_id, position) {
                Ok(_) => Response::Success { id },
                Err(e) => Response::Error {
                    id: Some(id),
                    message: format!("Failed to add track to chapter: {}", e),
                },
            }
        }

        Command::ExportRekordbox { id, chapter_ids, output_path } => {
            match db.export_rekordbox_xml(&chapter_ids, &output_path) {
                Ok(_) => Response::ExportComplete {
                    id,
                    path: output_path,
                },
                Err(e) => Response::Error {
                    id: Some(id),
                    message: format!("Export failed: {}", e),
                },
            }
        }

        Command::GetSettings { id } => {
            match db.get_settings() {
                Ok(settings) => Response::Settings {
                    id,
                    settings,
                },
                Err(e) => Response::Error {
                    id: Some(id),
                    message: format!("Failed to get settings: {}", e),
                },
            }
        }

        Command::SetSetting { id, key, value } => {
            match db.set_setting(&key, &value) {
                Ok(_) => Response::Success { id },
                Err(e) => Response::Error {
                    id: Some(id),
                    message: format!("Failed to set setting: {}", e),
                },
            }
        }

        Command::DownloadModel { id, model_name, url } => {
            // TODO: Implement model download with progress
            Response::Error {
                id: Some(id),
                message: "Model download not yet implemented".to_string(),
            }
        }

        Command::AnalyzeTrack { id, track_id } => {
            // TODO: Implement audio analysis pipeline
            Response::Error {
                id: Some(id),
                message: "Track analysis not yet implemented".to_string(),
            }
        }
    }
}
