use rusqlite::{Connection, params, OptionalExtension};
use tracing::{info, error};
use std::path::Path;

use crate::models::{Track, Chapter, TrackUpdate};

/// Database layer for DJ Curation - wraps SQLite with typed operations
pub struct Database {
    conn: Connection,
}

impl Database {
    /// Open or create database at the given path, running migrations
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        let db = Database { conn };
        db.migrate()?;
        Ok(db)
    }

    /// Run database migrations to create tables
    fn migrate(&self) -> Result<(), rusqlite::Error> {
        // Tracks table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT UNIQUE NOT NULL,
                title TEXT,
                artist TEXT,
                album TEXT,
                bpm REAL,
                key TEXT,
                camelot_key TEXT,
                energy INTEGER,
                danceability INTEGER,
                emotion TEXT,
                genre TEXT,
                sub_genre TEXT,
                duration_ms INTEGER,
                sample_rate INTEGER,
                bitrate INTEGER,
                file_size_bytes INTEGER,
                cover_art_path TEXT,
                analyzed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        // Feature vectors for ML
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS track_features (
                track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
                embedding TEXT NOT NULL,
                spectral_centroid REAL,
                spectral_rolloff REAL,
                zero_crossing_rate REAL,
                rms_energy REAL
            )",
            [],
        )?;

        // Chapters
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS chapters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                energy_target INTEGER,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        // Chapter tracks
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS chapter_tracks (
                chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
                track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
                position INTEGER NOT NULL,
                transition_notes TEXT,
                PRIMARY KEY (chapter_id, track_id)
            )",
            [],
        )?;

        // Track edges (compatibility)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS track_edges (
                source_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
                target_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
                compatibility_score REAL,
                harmonic_match INTEGER,
                energy_flow INTEGER,
                PRIMARY KEY (source_id, target_id)
            )",
            [],
        )?;

        // Settings
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )?;

        // Full-text search index
        self.conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
                title, artist, album, genre, sub_genre,
                content='tracks',
                content_rowid='id'
            )",
            [],
        )?;

        // FTS triggers for automatic indexing
        self.conn.execute(
            "CREATE TRIGGER IF NOT EXISTS tracks_fts_insert AFTER INSERT ON tracks BEGIN
                INSERT INTO tracks_fts(rowid, title, artist, album, genre, sub_genre)
                VALUES (new.id, new.title, new.artist, new.album, new.genre, new.sub_genre);
            END",
            [],
        )?;

        self.conn.execute(
            "CREATE TRIGGER IF NOT EXISTS tracks_fts_update AFTER UPDATE ON tracks BEGIN
                INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, genre, sub_genre)
                VALUES ('delete', old.id, old.title, old.artist, old.album, old.genre, old.sub_genre);
                INSERT INTO tracks_fts(rowid, title, artist, album, genre, sub_genre)
                VALUES (new.id, new.title, new.artist, new.album, new.genre, new.sub_genre);
            END",
            [],
        )?;

        self.conn.execute(
            "CREATE TRIGGER IF NOT EXISTS tracks_fts_delete AFTER DELETE ON tracks BEGIN
                INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, genre, sub_genre)
                VALUES ('delete', old.id, old.title, old.artist, old.album, old.genre, old.sub_genre);
            END",
            [],
        )?;

        // Indexes for performance
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tracks_energy ON tracks(energy)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tracks_bpm ON tracks(bpm)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chapter_tracks_chapter ON chapter_tracks(chapter_id)",
            [],
        )?;

        info!("Database migrations complete");
        Ok(())
    }

    /// Insert a new track, or update if file_path already exists
    pub fn insert_track(&self, track: &Track) -> Result<i64, rusqlite::Error> {
        self.conn.execute(
            "INSERT INTO tracks (file_path, title, artist, album, bpm, key, camelot_key,
                energy, danceability, emotion, genre, sub_genre, duration_ms,
                sample_rate, bitrate, file_size_bytes, cover_art_path, analyzed_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
            ON CONFLICT(file_path) DO UPDATE SET
                title = excluded.title,
                artist = excluded.artist,
                album = excluded.album,
                duration_ms = excluded.duration_ms,
                sample_rate = excluded.sample_rate,
                bitrate = excluded.bitrate,
                file_size_bytes = excluded.file_size_bytes,
                cover_art_path = excluded.cover_art_path",
            params![
                track.file_path,
                track.title,
                track.artist,
                track.album,
                track.bpm,
                track.key,
                track.camelot_key,
                track.energy,
                track.danceability,
                track.emotion,
                track.genre,
                track.sub_genre,
                track.duration_ms,
                track.sample_rate,
                track.bitrate,
                track.file_size_bytes,
                track.cover_art_path,
                track.analyzed_at,
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Get tracks with pagination
    pub fn get_tracks(&self, limit: usize, offset: usize) -> Result<Vec<Track>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, file_path, title, artist, album, bpm, key, camelot_key,
                energy, danceability, emotion, genre, sub_genre, duration_ms,
                sample_rate, bitrate, file_size_bytes, cover_art_path, analyzed_at, created_at
            FROM tracks
            ORDER BY created_at DESC
            LIMIT ?1 OFFSET ?2"
        )?;

        let tracks = stmt.query_map(params![limit as i64, offset as i64], |row| {
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
        })?;

        tracks.collect()
    }

    /// Search tracks using FTS5
    pub fn search_tracks(&self, query: &str) -> Result<Vec<Track>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT t.id, t.file_path, t.title, t.artist, t.album, t.bpm, t.key, t.camelot_key,
                t.energy, t.danceability, t.emotion, t.genre, t.sub_genre, t.duration_ms,
                t.sample_rate, t.bitrate, t.file_size_bytes, t.cover_art_path, t.analyzed_at, t.created_at
            FROM tracks t
            JOIN tracks_fts fts ON t.id = fts.rowid
            WHERE tracks_fts MATCH ?1
            ORDER BY rank
            LIMIT 100"
        )?;

        let tracks = stmt.query_map(params![query], |row| {
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
        })?;

        tracks.collect()
    }

    /// Update track metadata
    pub fn update_track(&self, track_id: i64, updates: &TrackUpdate) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "UPDATE tracks SET
                title = COALESCE(?2, title),
                artist = COALESCE(?3, artist),
                album = COALESCE(?4, album),
                bpm = COALESCE(?5, bpm),
                key = COALESCE(?6, key),
                camelot_key = COALESCE(?7, camelot_key),
                energy = COALESCE(?8, energy),
                danceability = COALESCE(?9, danceability),
                emotion = COALESCE(?10, emotion),
                genre = COALESCE(?11, genre),
                sub_genre = COALESCE(?12, sub_genre)
            WHERE id = ?1",
            params![
                track_id,
                updates.title,
                updates.artist,
                updates.album,
                updates.bpm,
                updates.key,
                updates.camelot_key,
                updates.energy,
                updates.danceability,
                updates.emotion,
                updates.genre,
                updates.sub_genre,
            ],
        )?;
        Ok(())
    }

    /// Delete a track and all related data
    pub fn delete_track(&self, track_id: i64) -> Result<(), rusqlite::Error> {
        self.conn.execute("DELETE FROM tracks WHERE id = ?1", params![track_id])?;
        Ok(())
    }

    /// Get total track count
    pub fn get_track_count(&self) -> Result<usize, rusqlite::Error> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM tracks",
            [],
            |row| row.get(0),
        )?;
        Ok(count as usize)
    }

    /// Create a new chapter
    pub fn create_chapter(&self, chapter: &Chapter) -> Result<i64, rusqlite::Error> {
        self.conn.execute(
            "INSERT INTO chapters (name, description, energy_target, sort_order)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT DO NOTHING",
            params![
                chapter.name,
                chapter.description,
                chapter.energy_target,
                chapter.sort_order,
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Get all chapters
    pub fn get_chapters(&self) -> Result<Vec<Chapter>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, description, energy_target, sort_order, created_at
            FROM chapters
            ORDER BY sort_order, created_at"
        )?;

        let chapters = stmt.query_map([], |row| {
            Ok(Chapter {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                energy_target: row.get(3)?,
                sort_order: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;

        chapters.collect()
    }

    /// Add track to chapter
    pub fn add_track_to_chapter(
        &self,
        chapter_id: i64,
        track_id: i64,
        position: i32,
    ) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "INSERT INTO chapter_tracks (chapter_id, track_id, position)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(chapter_id, track_id) DO UPDATE SET
                position = excluded.position",
            params![chapter_id, track_id, position],
        )?;
        Ok(())
    }

    /// Remove track from chapter
    pub fn remove_track_from_chapter(
        &self,
        chapter_id: i64,
        track_id: i64,
    ) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "DELETE FROM chapter_tracks WHERE chapter_id = ?1 AND track_id = ?2",
            params![chapter_id, track_id],
        )?;
        Ok(())
    }

    /// Delete a chapter and all its track associations
    pub fn delete_chapter(&self, chapter_id: i64) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "DELETE FROM chapter_tracks WHERE chapter_id = ?1",
            params![chapter_id],
        )?;
        self.conn.execute(
            "DELETE FROM chapters WHERE id = ?1",
            params![chapter_id],
        )?;
        Ok(())
    }

    /// Get ordered track IDs in a chapter
    pub fn get_chapter_tracks(&self, chapter_id: i64) -> Result<Vec<i64>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT track_id FROM chapter_tracks WHERE chapter_id = ?1 ORDER BY position"
        )?;
        let ids = stmt.query_map(params![chapter_id], |row| {
            row.get::<_, i64>(0)
        })?;
        ids.collect()
    }

    /// Export chapters to Rekordbox XML format
    pub fn export_rekordbox_xml(
        &self,
        chapter_ids: &[i64],
        output_path: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        use std::io::Write;
        use std::fs::File;

        let mut file = File::create(output_path)?;

        // Write XML header and DJ_PLAYLISTS root
        writeln!(file, r#"<?xml version="1.0" encoding="UTF-8"?>"#)?;
        writeln!(file, r#"<DJ_PLAYLISTS Version="1.0.0">"#)?;
        writeln!(file, r#"  <PRODUCT Name="rekordbox" Version="6.0.0" Company="AlphaTheta"/>"#)?;
        writeln!(file, r#"  <COLLECTION Entries="{}">"#, self.get_track_count()?)?;

        // Write all tracks in collection
        let tracks = self.get_tracks(100000, 0)?;
        for track in &tracks {
            writeln!(
                file,
                r#"    <TRACK TrackID="{}" Name="{}" Artist="{}" TotalTime="{}"/>"#,
                track.id,
                track.title.as_deref().unwrap_or("Unknown"),
                track.artist.as_deref().unwrap_or("Unknown"),
                track.duration_ms.map(|ms| ms / 1000).unwrap_or(0),
            )?;
        }

        writeln!(file, r#"  </COLLECTION>"#)?;
        writeln!(file, r#"  <PLAYLISTS>"#)?;
        writeln!(file, r#"    <NODE Type="0" Name="ROOT" Count="{}">"#, chapter_ids.len())?;

        // Write each chapter as a playlist node
        for chapter_id in chapter_ids {
            let chapter = self.conn.query_row(
                "SELECT name FROM chapters WHERE id = ?1",
                params![chapter_id],
                |row| -> Result<String, rusqlite::Error> { row.get(0) },
            )?;

            writeln!(
                file,
                r#"      <NODE Name="{}" Type="1" KeyType="0" Entries="0">"#,
                chapter
            )?;

            // Get tracks in this chapter
            let mut stmt = self.conn.prepare(
                "SELECT t.id, t.title, t.artist
                FROM tracks t
                JOIN chapter_tracks ct ON t.id = ct.track_id
                WHERE ct.chapter_id = ?1
                ORDER BY ct.position"
            )?;

            let chapter_tracks = stmt.query_map(params![chapter_id], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
            })?;

            for track_result in chapter_tracks {
                let (track_id, title, artist) = track_result?;
                writeln!(
                    file,
                    r#"        <TRACK Key="{}"/>"#,
                    track_id
                )?;
            }

            writeln!(file, r#"      </NODE>"#)?;
        }

        writeln!(file, r#"    </NODE>"#)?;
        writeln!(file, r#"  </PLAYLISTS>"#)?;
        writeln!(file, r#"</DJ_PLAYLISTS>"#)?;

        info!("Exported Rekordbox XML to {}", output_path);
        Ok(())
    }

    /// Get all settings
    pub fn get_settings(&self) -> Result<Vec<(String, String)>, rusqlite::Error> {
        let mut stmt = self.conn.prepare("SELECT key, value FROM settings")?;
        let settings = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        settings.collect()
    }

    /// Set a setting
    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    /// Get a single setting
    pub fn get_setting(&self, key: &str) -> Result<Option<String>, rusqlite::Error> {
        self.conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        ).optional()
    }

    /// Get a single track by ID
    pub fn get_track(&self, track_id: i64) -> Result<Option<crate::models::Track>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, file_path, title, artist, album, bpm, key, camelot_key,
                energy, danceability, emotion, genre, sub_genre, duration_ms,
                sample_rate, bitrate, file_size_bytes, cover_art_path, analyzed_at, created_at
            FROM tracks WHERE id = ?1"
        )?;

        let track = stmt.query_row(params![track_id], |row| {
            Ok(crate::models::Track {
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
        }).optional()?;

        Ok(track)
    }

    /// Insert feature vector for a track
    pub fn insert_features(&self, track_id: i64, features: &crate::models::TrackFeatures) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "INSERT INTO track_features (track_id, embedding, spectral_centroid, spectral_rolloff, zero_crossing_rate, rms_energy)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(track_id) DO UPDATE SET
                embedding = excluded.embedding,
                spectral_centroid = excluded.spectral_centroid,
                spectral_rolloff = excluded.spectral_rolloff,
                zero_crossing_rate = excluded.zero_crossing_rate,
                rms_energy = excluded.rms_energy",
            params![
                track_id,
                features.embedding,
                features.spectral_centroid,
                features.spectral_rolloff,
                features.zero_crossing_rate,
                features.rms_energy,
            ],
        )?;
        Ok(())
    }

    /// Get feature vector for a track
    pub fn get_features(&self, track_id: i64) -> Result<Option<crate::models::TrackFeatures>, rusqlite::Error> {
        let result = self.conn.query_row(
            "SELECT track_id, embedding, spectral_centroid, spectral_rolloff, zero_crossing_rate, rms_energy
            FROM track_features WHERE track_id = ?1",
            params![track_id],
            |row| {
                Ok(crate::models::TrackFeatures {
                    track_id: row.get(0)?,
                    embedding: row.get(1)?,
                    spectral_centroid: row.get(2)?,
                    spectral_rolloff: row.get(3)?,
                    zero_crossing_rate: row.get(4)?,
                    rms_energy: row.get(5)?,
                })
            },
        ).optional()?;
        Ok(result)
    }
}