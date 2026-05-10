//! Engine Prime / Engine DJ library export
//!
//! Generates the SQLite databases and folder structure required by
//! Denon DJ Engine Prime / Engine DJ software and SC5000/Prime 4
//! standalone hardware.
//!
//! References:
//! - https://github.com/mixxxdj/mixxx/wiki/Engine-Library-Format
//! - m.db  = metadata (tracks, playlists, crates)
//! - p.db  = performance data (beat grids, cues, waveforms)
//! - sm.db = Serato metadata schema (empty)
//! - sp.db = Serato performance schema (empty)

use rusqlite::{Connection, params};
use tracing::{info, error};
use std::path::{Path, PathBuf};
use std::collections::HashMap;

use crate::db::Database;
use crate::models::Track;

/// Camelot key to Engine Prime MetaDataInteger key type 4 integer mapping
fn camelot_to_engine_key(camelot: &str) -> Option<u32> {
    // Engine Prime key type 4 mapping:
    // 0=8B/Cmaj, 1=8A/Amin, 2=9B/Gmaj, 3=9A/Emin, 4=10B/Dmaj, 5=10A/Bmin,
    // 6=11B/Amaj, 7=11A/F#min, 8=12B/Emaj, 9=12A/Dbmin, 10=1B/Bmaj, 11=1A/Abmin,
    // 12=2B/F#maj, 13=2A/Ebmin, 14=3B/Dbmaj, 15=3A/Bbmin, 16=4B/Abmaj, 17=4A/Fmin,
    // 18=5B/Ebmaj, 19=5A/Cmin, 20=6B/Bbmaj, 21=6A/Gmin, 22=7B/Fmaj, 23=7A/Dmin
    let map: HashMap<&str, u32> = [
        ("8B", 0), ("8A", 1),
        ("9B", 2), ("9A", 3),
        ("10B", 4), ("10A", 5),
        ("11B", 6), ("11A", 7),
        ("12B", 8), ("12A", 9),
        ("1B", 10), ("1A", 11),
        ("2B", 12), ("2A", 13),
        ("3B", 14), ("3A", 15),
        ("4B", 16), ("4A", 17),
        ("5B", 18), ("5A", 19),
        ("6B", 20), ("6A", 21),
        ("7B", 22), ("7A", 23),
    ].iter().cloned().collect();
    map.get(camelot).copied()
}

/// Musical key names to Engine Prime key integer (fallback when no camelot)
fn musical_key_to_engine_key(key: &str) -> Option<u32> {
    let k = key.trim().to_lowercase();
    let map: HashMap<&str, u32> = [
        ("c", 0), ("c major", 0), ("cmaj", 0),
        ("a min", 1), ("a minor", 1), ("amin", 1), ("am", 1),
        ("g", 2), ("g major", 2), ("gmaj", 2),
        ("e min", 3), ("e minor", 3), ("emin", 3), ("em", 3),
        ("d", 4), ("d major", 4), ("dmaj", 4),
        ("b min", 5), ("b minor", 5), ("bmin", 5), ("bm", 5),
        ("a", 6), ("a major", 6), ("amaj", 6),
        ("f# min", 7), ("f# minor", 7), ("f#min", 7), ("f#m", 7), ("f sharp min", 7),
        ("e", 8), ("e major", 8), ("emaj", 8),
        ("db min", 9), ("db minor", 9), ("dbmin", 9), ("dbm", 9), ("c# min", 9), ("c# minor", 9), ("c#m", 9),
        ("b", 10), ("b major", 10), ("bmaj", 10),
        ("ab min", 11), ("ab minor", 11), ("abmin", 11), ("abm", 11), ("g# min", 11), ("g# minor", 11), ("g#m", 11),
        ("f#", 12), ("f# major", 12), ("f#maj", 12), ("f sharp major", 12), ("gb", 12),
        ("eb min", 13), ("eb minor", 13), ("ebmin", 13), ("ebm", 13), ("d# min", 13), ("d# minor", 13), ("d#m", 13),
        ("db", 14), ("db major", 14), ("dbmaj", 14), ("c#", 14), ("c# major", 14),
        ("bb min", 15), ("bb minor", 15), ("bbmin", 15), ("bbm", 15), ("a# min", 15), ("a# minor", 15), ("a#m", 15),
        ("ab", 16), ("ab major", 16), ("abmaj", 16), ("g#", 16), ("g# major", 16),
        ("f min", 17), ("f minor", 17), ("fmin", 17), ("fm", 17),
        ("eb", 18), ("eb major", 18), ("ebmaj", 18), ("d#", 18), ("d# major", 18),
        ("c min", 19), ("c minor", 19), ("cmin", 19), ("cm", 19),
        ("bb", 20), ("bb major", 20), ("bbmaj", 20), ("a#", 20), ("a# major", 20),
        ("g min", 21), ("g minor", 21), ("gmin", 21), ("gm", 21),
        ("f", 22), ("f major", 22), ("fmaj", 22),
        ("d min", 23), ("d minor", 23), ("dmin", 23), ("dm", 23),
    ].iter().cloned().collect();
    map.get(k.as_str()).copied()
}

/// Get Engine Prime key integer from track data
fn track_to_engine_key(track: &Track) -> Option<u32> {
    track.camelot_key.as_deref()
        .and_then(camelot_to_engine_key)
        .or_else(|| track.key.as_deref().and_then(musical_key_to_engine_key))
}

/// Extension from file path
fn file_extension(path: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_else(|| "mp3".to_string())
}

/// Filename without directory
fn file_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or("unknown")
        .to_string()
}

/// Create Engine Prime library at output_dir/"Engine Library"
pub fn export_engine_prime(
    db: &Database,
    chapter_ids: &[i64],
    output_dir: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let output = PathBuf::from(output_dir);
    let engine_lib = output.join("Engine Library");
    std::fs::create_dir_all(&engine_lib)?;

    info!("Exporting Engine Prime library to {}", engine_lib.display());

    // --- m.db: metadata database ---
    let m_db_path = engine_lib.join("m.db");
    let m_db = Connection::open(&m_db_path)?;
    create_m_db_schema(&m_db)?;
    populate_m_db(db, &m_db, chapter_ids)?;
    m_db.close().map_err(|(_, e)| e)?;
    info!("Created m.db with {} tracks", db.get_track_count()?);

    // --- p.db: performance database (schema only for now) ---
    let p_db_path = engine_lib.join("p.db");
    let p_db = Connection::open(&p_db_path)?;
    create_p_db_schema(&p_db)?;
    p_db.close().map_err(|(_, e)| e)?;
    info!("Created p.db (schema only)");

    // --- sm.db: Serato metadata schema (empty) ---
    let sm_db_path = engine_lib.join("sm.db");
    let sm_db = Connection::open(&sm_db_path)?;
    create_m_db_schema(&sm_db)?;
    sm_db.close().map_err(|(_, e)| e)?;

    // --- sp.db: Serato performance schema (empty) ---
    let sp_db_path = engine_lib.join("sp.db");
    let sp_db = Connection::open(&sp_db_path)?;
    create_p_db_schema(&sp_db)?;
    sp_db.close().map_err(|(_, e)| e)?;

    info!("Engine Prime export complete at {}", engine_lib.display());
    Ok(())
}

fn create_m_db_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    // Information table (single row with DB metadata)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS Information (
            id INTEGER PRIMARY KEY,
            uuid TEXT NOT NULL,
            schemaVersionMajor INTEGER NOT NULL,
            schemaVersionMinor INTEGER NOT NULL,
            schemaVersionPatch INTEGER NOT NULL,
            currentPlayedIndicator INTEGER NOT NULL DEFAULT 0
        )",
        [],
    )?;

    // AlbumArt table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS AlbumArt (
            id INTEGER PRIMARY KEY,
            hash TEXT,
            albumArt BLOB
        )",
        [],
    )?;
    // Insert default "no art" entry (id=1)
    conn.execute(
        "INSERT OR IGNORE INTO AlbumArt (id, hash, albumArt) VALUES (1, NULL, NULL)",
        [],
    )?;

    // Track table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS Track (
            id INTEGER PRIMARY KEY,
            playOrder INTEGER,
            length INTEGER,
            lengthCalculated INTEGER,
            bpm INTEGER,
            year INTEGER,
            path TEXT NOT NULL,
            filename TEXT NOT NULL,
            bitrate INTEGER,
            bpmAnalyzed REAL,
            trackType INTEGER DEFAULT 1,
            isExternalTrack NUMERIC DEFAULT 0,
            uuidOfExternalDatabase TEXT,
            idTrackInExternalDatabase INTEGER,
            idAlbumArt INTEGER DEFAULT 1 REFERENCES AlbumArt(id)
        )",
        [],
    )?;

    // MetaData table (keyed text metadata)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS MetaData (
            id INTEGER NOT NULL,
            type INTEGER NOT NULL,
            text TEXT,
            PRIMARY KEY (id, type)
        )",
        [],
    )?;

    // MetaDataInteger table (keyed numeric metadata)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS MetaDataInteger (
            id INTEGER NOT NULL,
            type INTEGER NOT NULL,
            value INTEGER,
            PRIMARY KEY (id, type)
        )",
        [],
    )?;

    // Crate table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS Crate (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            path TEXT
        )",
        [],
    )?;

    // CrateHierarchy
    conn.execute(
        "CREATE TABLE IF NOT EXISTS CrateHierarchy (
            crateId INTEGER NOT NULL,
            crateIdChild INTEGER NOT NULL,
            PRIMARY KEY (crateId, crateIdChild)
        )",
        [],
    )?;

    // CrateParentList
    conn.execute(
        "CREATE TABLE IF NOT EXISTS CrateParentList (
            crateOriginId INTEGER NOT NULL,
            crateParentId INTEGER NOT NULL,
            PRIMARY KEY (crateOriginId, crateParentId)
        )",
        [],
    )?;

    // CrateTrackList
    conn.execute(
        "CREATE TABLE IF NOT EXISTS CrateTrackList (
            crateId INTEGER NOT NULL,
            trackId INTEGER NOT NULL,
            PRIMARY KEY (crateId, trackId)
        )",
        [],
    )?;

    // Playlist table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS Playlist (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL
        )",
        [],
    )?;

    // PlaylistTrackList
    conn.execute(
        "CREATE TABLE IF NOT EXISTS PlaylistTrackList (
            playlistId INTEGER NOT NULL,
            trackId INTEGER NOT NULL,
            trackIdInOriginDatabase INTEGER,
            databaseUuid TEXT,
            trackNumber INTEGER,
            PRIMARY KEY (playlistId, trackId)
        )",
        [],
    )?;

    // Historylist
    conn.execute(
        "CREATE TABLE IF NOT EXISTS Historylist (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL
        )",
        [],
    )?;

    // HistorylistTrackList
    conn.execute(
        "CREATE TABLE IF NOT EXISTS HistorylistTrackList (
            historylistId INTEGER NOT NULL,
            trackId INTEGER NOT NULL,
            trackIdInOriginDatabase INTEGER,
            databaseUuid TEXT,
            date INTEGER,
            PRIMARY KEY (historylistId, trackId)
        )",
        [],
    )?;

    // Preparelist
    conn.execute(
        "CREATE TABLE IF NOT EXISTS Preparelist (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL
        )",
        [],
    )?;

    // PreparelistTrackList
    conn.execute(
        "CREATE TABLE IF NOT EXISTS PreparelistTrackList (
            playlistId INTEGER NOT NULL,
            trackId INTEGER NOT NULL,
            trackIdInOriginDatabase INTEGER,
            databaseUuid TEXT,
            trackNumber INTEGER,
            PRIMARY KEY (playlistId, trackId)
        )",
        [],
    )?;

    Ok(())
}

fn create_p_db_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS Information (
            id INTEGER PRIMARY KEY,
            uuid TEXT NOT NULL,
            schemaVersionMajor INTEGER NOT NULL,
            schemaVersionMinor INTEGER NOT NULL,
            schemaVersionPatch INTEGER NOT NULL,
            currentPlayedIndicator INTEGER NOT NULL DEFAULT 0
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS PerformanceData (
            id INTEGER PRIMARY KEY,
            isAnalyzed NUMERIC DEFAULT 0,
            isRendered NUMERIC DEFAULT 0,
            trackData BLOB,
            highResolutionWaveFormData BLOB,
            overviewWaveFormData BLOB,
            beatData BLOB,
            quickCues BLOB,
            loops BLOB,
            hasSeratoValues NUMERIC DEFAULT 0
        )",
        [],
    )?;

    Ok(())
}

fn populate_m_db(
    db: &Database,
    m_db: &Connection,
    chapter_ids: &[i64],
) -> Result<(), Box<dyn std::error::Error>> {
    // Insert Information row
    let db_uuid = uuid::Uuid::new_v4().to_string();
    m_db.execute(
        "INSERT INTO Information (id, uuid, schemaVersionMajor, schemaVersionMinor, schemaVersionPatch, currentPlayedIndicator)
         VALUES (1, ?1, 1, 6, 0, 0)",
        params![db_uuid],
    )?;

    // Get all tracks
    let tracks = db.get_tracks(100000, 0)?;
    let track_count = tracks.len() as i64;

    // Insert tracks
    for track in &tracks {
        let ext = file_extension(&track.file_path);
        let fname = file_name(&track.file_path);

        // Use absolute path (Engine Prime resolves these)
        let path_for_db = &track.file_path;

        let length_sec = track.duration_ms.map(|ms| (ms as f64 / 1000.0).ceil() as i64).unwrap_or(0);
        let bpm_whole = track.bpm.map(|b| b.round() as i64).unwrap_or(0);
        let bpm_analyzed = track.bpm.unwrap_or(0.0);
        let bitrate = track.bitrate.map(|b| b as i64).unwrap_or(0);

        m_db.execute(
            "INSERT INTO Track (id, playOrder, length, lengthCalculated, bpm, year,
                path, filename, bitrate, bpmAnalyzed, trackType, isExternalTrack, idAlbumArt)
             VALUES (?1, NULL, ?2, ?3, ?4, NULL, ?5, ?6, ?7, ?8, 1, 0, 1)",
            params![
                track.id,
                length_sec,
                length_sec,
                bpm_whole,
                path_for_db,
                fname,
                bitrate,
                bpm_analyzed,
            ],
        )?;

        // Insert MetaData entries
        // type 0 = Title, 1 = Artist, 3 = Genre, 11 = Duration MM:SS, 13 = Analysed flag, 17 = File extension
        if let Some(ref title) = track.title {
            m_db.execute(
                "INSERT INTO MetaData (id, type, text) VALUES (?1, 0, ?2)",
                params![track.id, title],
            )?;
        }
        if let Some(ref artist) = track.artist {
            m_db.execute(
                "INSERT INTO MetaData (id, type, text) VALUES (?1, 1, ?2)",
                params![track.id, artist],
            )?;
        }
        if let Some(ref album) = track.album {
            m_db.execute(
                "INSERT INTO MetaData (id, type, text) VALUES (?1, 2, ?2)",
                params![track.id, album],
            )?;
        }
        if let Some(ref genre) = track.genre {
            m_db.execute(
                "INSERT INTO MetaData (id, type, text) VALUES (?1, 3, ?2)",
                params![track.id, genre],
            )?;
        }
        // Duration in MM:SS (type 9)
        let duration_sec = track.duration_ms.map(|ms| ms / 1000).unwrap_or(0);
        let mmss = format!("{:02}:{:02}", duration_sec / 60, duration_sec % 60);
        m_db.execute(
            "INSERT INTO MetaData (id, type, text) VALUES (?1, 9, ?2)",
            params![track.id, mmss],
        )?;

        // File extension (type 13)
        m_db.execute(
            "INSERT INTO MetaData (id, type, text) VALUES (?1, 13, ?2)",
            params![track.id, ext],
        )?;

        // Analysed flag (type 14) = 1
        m_db.execute(
            "INSERT INTO MetaData (id, type, text) VALUES (?1, 14, '1')",
            params![track.id],
        )?;

        // MetaDataInteger entries
        // type 4 = Musical key
        if let Some(key_int) = track_to_engine_key(track) {
            m_db.execute(
                "INSERT INTO MetaDataInteger (id, type, value) VALUES (?1, 4, ?2)",
                params![track.id, key_int as i64],
            )?;
        }

        // type 5 = Rating (0,20,40,60,80,100,120) — default 0
        m_db.execute(
            "INSERT INTO MetaDataInteger (id, type, value) VALUES (?1, 5, 0)",
            params![track.id],
        )?;
    }

    // Insert chapters as Playlists
    let mut playlist_counter = 1;
    for chapter_id in chapter_ids {
        let chapter_name: String = match db.conn.query_row(
            "SELECT name FROM chapters WHERE id = ?1",
            params![chapter_id],
            |row| row.get(0),
        ) {
            Ok(name) => name,
            Err(e) => {
                error!("Failed to get chapter {}: {}", chapter_id, e);
                continue;
            }
        };

        m_db.execute(
            "INSERT INTO Playlist (id, title) VALUES (?1, ?2)",
            params![playlist_counter, chapter_name],
        )?;

        // Get tracks in chapter, ordered by position
        let mut stmt = db.conn.prepare(
            "SELECT ct.track_id FROM chapter_tracks ct
             WHERE ct.chapter_id = ?1
             ORDER BY ct.position"
        )?;
        let track_ids = stmt.query_map(params![chapter_id], |row| {
            row.get::<_, i64>(0)
        })?;

        let mut track_number = 1;
        for track_id_result in track_ids {
            let track_id = track_id_result?;
            m_db.execute(
                "INSERT INTO PlaylistTrackList (playlistId, trackId, trackIdInOriginDatabase, databaseUuid, trackNumber)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    playlist_counter,
                    track_id,
                    track_id,
                    &db_uuid,
                    track_number,
                ],
            )?;
            track_number += 1;
        }

        playlist_counter += 1;
    }

    // Also insert chapters as Crates (folder structure)
    let mut crate_counter = 1;
    for chapter_id in chapter_ids {
        let chapter_name: String = match db.conn.query_row(
            "SELECT name FROM chapters WHERE id = ?1",
            params![chapter_id],
            |row| row.get(0),
        ) {
            Ok(name) => name,
            Err(_) => continue,
        };

        m_db.execute(
            "INSERT INTO Crate (id, title, path) VALUES (?1, ?2, ?3)",
            params![crate_counter, &chapter_name, &chapter_name],
        )?;

        let mut stmt = db.conn.prepare(
            "SELECT ct.track_id FROM chapter_tracks ct
             WHERE ct.chapter_id = ?1
             ORDER BY ct.position"
        )?;
        let track_ids = stmt.query_map(params![chapter_id], |row| {
            row.get::<_, i64>(0)
        })?;

        for track_id_result in track_ids {
            let track_id = track_id_result?;
            m_db.execute(
                "INSERT INTO CrateTrackList (crateId, trackId) VALUES (?1, ?2)",
                params![crate_counter, track_id],
            )?;
        }

        crate_counter += 1;
    }

    info!("Inserted {} tracks, {} playlists, {} crates into m.db", track_count, chapter_ids.len(), chapter_ids.len());
    Ok(())
}
