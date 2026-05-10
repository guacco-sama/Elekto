use std::io::{self, BufRead, Write};

mod audio;
mod db;
mod export;
mod ipc;
mod llm;
mod models;
mod nl_search;
mod scanner;
mod sort;
mod waveform;

use ipc::{Command, Response};
use tracing::{info, error, warn};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter("info")
        .init();

    info!("Elekto Worker v0.1.0 starting...");

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

fn write_progress(id: &str, processed: usize, total: usize, current_track_id: i64) -> std::io::Result<()> {
    let mut stdout = std::io::stdout();
    let resp = Response::AnalysisProgress {
        id: id.to_string(),
        track_id: current_track_id,
        progress: (processed as f32 / total.max(1) as f32) * 100.0,
        status: format!("{}/{} tracks analyzed", processed, total),
    };
    let json = serde_json::to_string(&resp)?;
    writeln!(stdout, "{}", json)?;
    stdout.flush()
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

        Command::SearchNL { id, query } => {
            match nl_search::search_nl(&db, &query) {
                Ok(tracks) => {
                    let total = tracks.len();
                    Response::Tracks {
                        id,
                        tracks,
                        total,
                    }
                }
                Err(e) => Response::Error {
                    id: Some(id),
                    message: format!("NL search failed: {}", e),
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

        Command::RemoveTrackFromChapter { id, chapter_id, track_id } => {
            match db.remove_track_from_chapter(chapter_id, track_id) {
                Ok(_) => Response::Success { id },
                Err(e) => Response::Error {
                    id: Some(id),
                    message: format!("Failed to remove track from chapter: {}", e),
                },
            }
        }

        Command::DeleteChapter { id, chapter_id } => {
            match db.delete_chapter(chapter_id) {
                Ok(_) => Response::Success { id },
                Err(e) => Response::Error {
                    id: Some(id),
                    message: format!("Failed to delete chapter: {}", e),
                },
            }
        }

        Command::GetChapterTracks { id, chapter_id } => {
            match db.get_chapter_tracks(chapter_id) {
                Ok(track_ids) => Response::ChapterTracks {
                    id,
                    chapter_id,
                    track_ids,
                },
                Err(e) => Response::Error {
                    id: Some(id),
                    message: format!("Failed to get chapter tracks: {}", e),
                },
            }
        }

        Command::SortChapter { id, chapter_id, strategy } => {
            match sort::sort_tracks(&db, chapter_id, &strategy) {
                Ok(track_ids) => {
                    // Update positions in database
                    for (pos, track_id) in track_ids.iter().enumerate() {
                        let _ = db.add_track_to_chapter(chapter_id, *track_id, pos as i32);
                    }
                    Response::ChapterSorted {
                        id,
                        chapter_id,
                        track_ids,
                    }
                }
                Err(e) => Response::Error {
                    id: Some(id),
                    message: format!("Sort failed: {}", e),
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

        Command::ExportEnginePrime { id, chapter_ids, output_path } => {
            match export::export_engine_prime(&db, &chapter_ids, &output_path) {
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

        Command::GetSetting { id, key } => {
            match db.get_setting(&key) {
                Ok(value) => Response::ConfigValue { id, key, value },
                Err(e) => Response::Error {
                    id: Some(id),
                    message: format!("Failed to get setting: {}", e),
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

        Command::AnalyzeAll { id, track_ids, threads } => {
            let thread_count = threads.unwrap_or(4).clamp(1, 16);
            let total = track_ids.len();
            if total == 0 {
                return Response::Success { id };
            }

            let mut processed = 0usize;
            for chunk in track_ids.chunks(thread_count) {
                let mut handles = Vec::new();
                for &track_id in chunk {
                    let track = match db.get_track(track_id) {
                        Ok(Some(t)) => t,
                        _ => continue,
                    };
                    handles.push((track_id, track.file_path.clone()));
                }

                // Send progress before starting chunk
                if !handles.is_empty() {
                    let _ = write_progress(&id, processed, total, handles[0].0);
                }

                // Analyze chunk in parallel
                use rayon::prelude::*;
                let results: Vec<_> = handles.par_iter().map(|(tid, path)| {
                    match audio::decode_audio(path) {
                        Ok((samples, sample_rate)) => {
                            match audio::analyze(&samples, sample_rate) {
                                Ok(analysis) => Some((*tid, analysis, samples.len(), sample_rate)),
                                Err(_) => None,
                            }
                        }
                        Err(_) => None,
                    }
                }).collect();

                // Update database with results
                for result in results {
                    if let Some((track_id, analysis, _sample_count, _sr)) = result {
                        let updates = models::TrackUpdate {
                            title: None, artist: None, album: None,
                            bpm: Some(analysis.bpm),
                            key: Some(analysis.key),
                            camelot_key: Some(analysis.camelot_key),
                            energy: Some(analysis.energy),
                            danceability: Some(analysis.danceability),
                            emotion: Some(analysis.emotion.clone()),
                            genre: None, sub_genre: None, tags: None,
                        };
                        let _ = db.update_track(track_id, &updates);
                        let features = models::TrackFeatures {
                            track_id,
                            embedding: serde_json::to_string(&analysis.features).unwrap_or_else(|_| "[]".to_string()),
                            spectral_centroid: Some(analysis.spectral_centroid),
                            spectral_rolloff: Some(analysis.spectral_rolloff),
                            zero_crossing_rate: Some(analysis.zero_crossing_rate),
                            rms_energy: Some(analysis.rms_energy),
                        };
                        let _ = db.insert_features(track_id, &features);
                        processed += 1;
                    }
                }
            }

            Response::Success { id }
        }

        Command::AnalyzeTrack { id, track_id } => {
            info!("Analyzing track {}", track_id);

            // Get track file path from database
            let track = match db.get_track(track_id) {
                Ok(Some(t)) => t,
                Ok(None) => {
                    return Response::Error {
                        id: Some(id),
                        message: format!("Track {} not found", track_id),
                    };
                }
                Err(e) => {
                    return Response::Error {
                        id: Some(id),
                        message: format!("Failed to get track: {}", e),
                    };
                }
            };

            // Decode audio
            let (samples, sample_rate) = match audio::decode_audio(&track.file_path) {
                Ok(result) => result,
                Err(e) => {
                    return Response::Error {
                        id: Some(id),
                        message: format!("Audio decode failed: {}", e),
                    };
                }
            };

            info!("Decoded {} samples at {} Hz, running analysis...", samples.len(), sample_rate);

            // Run analysis
            let analysis = match audio::analyze(&samples, sample_rate) {
                Ok(a) => a,
                Err(e) => {
                    return Response::Error {
                        id: Some(id),
                        message: format!("Analysis failed: {}", e),
                    };
                }
            };

            info!("Analysis complete: BPM={}, Key={}, Energy={}", analysis.bpm, analysis.key, analysis.energy);

            // Update track with analysis results
            let updates = models::TrackUpdate {
                title: None,
                artist: None,
                album: None,
                bpm: Some(analysis.bpm),
                key: Some(analysis.key.clone()),
                camelot_key: Some(analysis.camelot_key.clone()),
                energy: Some(analysis.energy),
                danceability: Some(analysis.danceability),
                emotion: Some(analysis.emotion.clone()),
                genre: None,
                sub_genre: None,
                tags: None,
            };

            if let Err(e) = db.update_track(track_id, &updates) {
                return Response::Error {
                    id: Some(id),
                    message: format!("Failed to update track: {}", e),
                };
            }

            // Store feature vector
            let features = models::TrackFeatures {
                track_id,
                embedding: serde_json::to_string(&analysis.features).unwrap_or_else(|_| "[]".to_string()),
                spectral_centroid: Some(analysis.spectral_centroid),
                spectral_rolloff: Some(analysis.spectral_rolloff),
                zero_crossing_rate: Some(analysis.zero_crossing_rate),
                rms_energy: Some(analysis.rms_energy),
            };
            if let Err(e) = db.insert_features(track_id, &features) {
                warn!("Failed to store features: {}", e);
            }

            Response::AnalysisComplete {
                id,
                track_id,
                tags: updates,
            }
        }

        Command::AutoTagTrack { id, track_id } => {
            info!("Auto-tagging track {}", track_id);

            // Get track + existing analysis from DB
            let track = match db.get_track(track_id) {
                Ok(Some(t)) => t,
                Ok(None) => {
                    return Response::Error {
                        id: Some(id),
                        message: format!("Track {} not found", track_id),
                    };
                }
                Err(e) => {
                    return Response::Error {
                        id: Some(id),
                        message: format!("Failed to get track: {}", e),
                    };
                }
            };

            // Get audio features
            let features_row = match db.get_features(track_id) {
                Ok(Some(f)) => f,
                _ => {
                    return Response::Error {
                        id: Some(id),
                        message: "Track not analyzed yet. Run AnalyzeTrack first.".to_string(),
                    };
                }
            };

            // Parse feature JSON
            let parsed: serde_json::Value = match serde_json::from_str(&features_row.embedding) {
                Ok(v) => v,
                Err(e) => {
                    return Response::Error {
                        id: Some(id),
                        message: format!("Failed to parse features: {}", e),
                    };
                }
            };

            // Build audio features for rule-based tagging
            let audio_features = llm::AudioFeatures {
                bpm: track.bpm.unwrap_or(128.0),
                key: track.key.clone().unwrap_or_else(|| "C".into()),
                camelot_key: track.camelot_key.clone().unwrap_or_else(|| "8B".into()),
                energy: track.energy.map(|e| e as f64 / 10.0).unwrap_or(0.5),
                danceability: track.danceability.map(|d| d as f64 / 10.0).unwrap_or(0.5),
                spectral_centroid: features_row.spectral_centroid.unwrap_or(2500.0),
                spectral_rolloff: features_row.spectral_rolloff.unwrap_or(5000.0),
                zero_crossing_rate: features_row.zero_crossing_rate.unwrap_or(0.05),
                rms_energy: features_row.rms_energy.unwrap_or(0.3),
                bass: parsed["bass"].as_f64().unwrap_or(0.5) as f32,
                mids: parsed["mids"].as_f64().unwrap_or(0.5) as f32,
                treble: parsed["treble"].as_f64().unwrap_or(0.5) as f32,
                brightness: parsed["brightness"].as_f64().unwrap_or(0.5) as f32,
                noisiness: parsed["noisiness"].as_f64().unwrap_or(0.3) as f32,
            };

            // Rule-based auto-tag (no model needed, instant)
            let tagger = llm::AutoTagger::new();
            let auto_tags = tagger.tag(&audio_features, track.title.as_deref(), track.artist.as_deref());

            let updates = models::TrackUpdate {
                title: None,
                artist: None,
                album: None,
                bpm: None,
                key: None,
                camelot_key: None,
                energy: Some(auto_tags.energy),
                danceability: Some(auto_tags.danceability),
                emotion: Some(auto_tags.mood.clone()),
                genre: Some(auto_tags.genre.clone()),
                sub_genre: Some(auto_tags.sub_genre.clone()),
                tags: None,
            };

            if let Err(e) = db.update_track(track_id, &updates) {
                return Response::Error {
                    id: Some(id),
                    message: format!("Failed to update track: {}", e),
                };
            }

            info!("Auto-tag complete: genre={}, sub_genre={}, mood={}, confidence={:.0}%",
                auto_tags.genre, auto_tags.sub_genre, auto_tags.mood, auto_tags.confidence * 100.0);

            Response::AutoTagComplete {
                id,
                track_id,
                tags: updates,
            }
        }

        Command::ModelStatus { id } => {
            Response::ModelStatus {
                id,
                ready: true,
                model_name: "Rule-based AutoTagger (no download required)".to_string(),
                downloaded: true,
            }
        }

        Command::GetWaveform { id, track_id, pixel_width } => {
            info!("Generating waveform for track {}", track_id);

            let track = match db.get_track(track_id) {
                Ok(Some(t)) => t,
                Ok(None) => {
                    return Response::Error {
                        id: Some(id),
                        message: format!("Track {} not found", track_id),
                    };
                }
                Err(e) => {
                    return Response::Error {
                        id: Some(id),
                        message: format!("Failed to get track: {}", e),
                    };
                }
            };

            // Decode audio
            let (samples, sample_rate) = match audio::decode_audio(&track.file_path) {
                Ok(result) => result,
                Err(e) => {
                    return Response::Error {
                        id: Some(id),
                        message: format!("Audio decode failed: {}", e),
                    };
                }
            };

            // Generate waveform
            let width = pixel_width.unwrap_or(1200);
            let wf = waveform::generate_waveform(&samples, sample_rate, width);
            let wf_json = waveform::waveform_to_json(&wf);

            // Generate beat-grid using existing BPM
            let bpm = track.bpm.unwrap_or(128.0);
            let grid = waveform::detect_beat_grid(&samples, sample_rate, bpm);
            let grid_json = waveform::beatgrid_to_json(&grid);

            // Detect cue points from energy envelope
            let cues = waveform::detect_cue_points(&samples, sample_rate, &grid);
            let cues_json = waveform::cues_to_json(&cues);

            Response::WaveformData {
                id,
                track_id,
                waveform_json: wf_json,
                beatgrid_json: grid_json,
                cues_json,
            }
        }
    }
}
