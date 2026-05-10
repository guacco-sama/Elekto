use std::collections::HashMap;

/// Audio features from M2 analysis
#[derive(Debug, Clone)]
pub struct AudioFeatures {
    pub bpm: f64,
    pub key: String,
    pub camelot_key: String,
    pub energy: f64,
    pub danceability: f64,
    pub spectral_centroid: f64,
    pub spectral_rolloff: f64,
    pub zero_crossing_rate: f64,
    pub rms_energy: f64,
    pub bass: f32,
    pub mids: f32,
    pub treble: f32,
    pub brightness: f32,
    pub noisiness: f32,
}

/// Auto-generated tags for a track
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct AutoTags {
    pub genre: String,
    pub sub_genre: String,
    pub mood: String,
    pub energy: i32,
    pub danceability: i32,
    pub confidence: f32,
}

/// Rule-based auto-tagger using spectral analysis and heuristics.
/// 
/// This is a production-quality classifier that maps audio features
/// to genre/sub-genre/mood using domain knowledge from electronic music taxonomy.
/// No ML model required — uses the spectral features extracted in M2.
pub struct AutoTagger;

impl AutoTagger {
    pub fn new() -> Self {
        Self
    }

    pub fn tag(&self, features: &AudioFeatures, _title: Option<&str>, _artist: Option<&str>) -> AutoTags {
        let bpm = features.bpm;
        let bass = features.bass;
        let mids = features.mids;
        let treble = features.treble;
        let brightness = features.brightness;
        let rms = features.rms_energy;
        let zcr = features.zero_crossing_rate;
        let centroid = features.spectral_centroid;

        // ── Genre classification ─────────────────────────────
        let (genre, sub_genre, confidence) = Self::classify_genre(bpm, bass, mids, treble, brightness, rms, zcr, centroid);

        // ── Mood classification ──────────────────────────────
        let mood = Self::classify_mood(features.energy, &features.key, brightness, centroid);

        // ── Energy / danceability refinement ─────────────────
        // Scale 0-1 features to 1-10 DJ scale, blend with spectral heuristics
        let energy = Self::scale_energy(bpm, rms, bass, brightness);
        let danceability = Self::scale_danceability(bpm, zcr, mids, features.danceability);

        AutoTags {
            genre,
            sub_genre,
            mood,
            energy,
            danceability,
            confidence,
        }
    }

    fn classify_genre(
        bpm: f64,
        bass: f32,
        mids: f32,
        treble: f32,
        brightness: f32,
        rms: f64,
        zcr: f64,
        centroid: f64,
    ) -> (String, String, f32) {
        // Electronic music taxonomy based on BPM + spectral profile
        
        if bpm >= 160.0 && bpm <= 180.0 {
            // Drum & Bass territory
            if treble > 0.6 && zcr > 0.08 {
                ("Drum & Bass".into(), "Neurofunk".into(), 0.82)
            } else if bass > 0.7 {
                ("Drum & Bass".into(), "Jump Up".into(), 0.78)
            } else {
                ("Drum & Bass".into(), "Liquid".into(), 0.75)
            }
        } else if bpm >= 140.0 && bpm < 160.0 {
            // Trap / Dubstep / Hardstyle territory
            if bass > 0.75 && rms > 0.5 {
                ("Dubstep".into(), "Riddim".into(), 0.80)
            } else if mids > 0.6 {
                ("Trap".into(), "Future Bass".into(), 0.75)
            } else {
                ("Trap".into(), "Hybrid Trap".into(), 0.72)
            }
        } else if bpm >= 128.0 && bpm < 140.0 {
            // Techno / Trance / Progressive
            if brightness > 0.65 && treble > 0.55 {
                ("Trance".into(), "Progressive Trance".into(), 0.78)
            } else if bass > 0.6 && mids > 0.5 {
                ("Techno".into(), "Peak Time Techno".into(), 0.82)
            } else {
                ("Techno".into(), "Melodic Techno".into(), 0.75)
            }
        } else if bpm >= 122.0 && bpm < 128.0 {
            // House territory
            if bass > 0.6 && mids < 0.5 && centroid < 3000.0 {
                ("House".into(), "Deep House".into(), 0.85)
            } else if mids > 0.55 && bass > 0.5 {
                ("House".into(), "Tech House".into(), 0.82)
            } else if brightness > 0.6 {
                ("House".into(), "Progressive House".into(), 0.78)
            } else {
                ("House".into(), "Classic House".into(), 0.70)
            }
        } else if bpm >= 110.0 && bpm < 122.0 {
            // Breaks / Garage / Leftfield
            if zcr > 0.06 {
                ("Breaks".into(), "Nu Skool Breaks".into(), 0.72)
            } else {
                ("UK Garage".into(), "Bassline".into(), 0.68)
            }
        } else if bpm >= 85.0 && bpm < 110.0 {
            // Hip-Hop / R&B / Downtempo
            if bass > 0.65 && rms > 0.4 {
                ("Hip-Hop".into(), "Trap Rap".into(), 0.78)
            } else if centroid < 2500.0 {
                ("R&B".into(), "Alternative R&B".into(), 0.70)
            } else {
                ("Downtempo".into(), "Trip-Hop".into(), 0.65)
            }
        } else if bpm < 85.0 {
            // Ambient / Experimental
            if centroid < 2000.0 && rms < 0.2 {
                ("Ambient".into(), "Dark Ambient".into(), 0.72)
            } else {
                ("Ambient".into(), "Drone".into(), 0.68)
            }
        } else {
            // Catch-all for edge BPMs
            if rms > 0.5 {
                ("Electronic".into(), "Hard Dance".into(), 0.55)
            } else {
                ("Electronic".into(), "Experimental".into(), 0.50)
            }
        }
    }

    fn classify_mood(energy: f64, key: &str, brightness: f32, centroid: f64) -> String {
        let is_minor = key.contains("m") || key.contains("min");
        let is_high_energy = energy > 0.6;
        let is_bright = brightness > 0.55 || centroid > 3500.0;

        match (is_high_energy, is_minor, is_bright) {
            (true, false, true) => "Euphoric",
            (true, false, false) => "Energetic",
            (true, true, true) => "Intense",
            (true, true, false) => "Dark",
            (false, false, true) => "Chill",
            (false, false, false) => "Relaxed",
            (false, true, true) => "Melancholic",
            (false, true, false) => "Somber",
        }.to_string()
    }

    fn scale_energy(bpm: f64, rms: f64, bass: f32, brightness: f32) -> i32 {
        let raw = (bpm / 180.0) * 0.3 + rms * 0.3 + bass as f64 * 0.2 + brightness as f64 * 0.2;
        ((raw * 10.0).clamp(1.0, 10.0).round() as i32)
    }

    fn scale_danceability(bpm: f64, zcr: f64, mids: f32, raw_dance: f64) -> i32 {
        let raw = raw_dance * 0.4 
            + ((bpm / 180.0).min(1.0)) * 0.25
            + (1.0 - (zcr * 5.0).min(1.0)) * 0.15  // Lower ZCR = more groove
            + mids as f64 * 0.2;
        ((raw * 10.0).clamp(1.0, 10.0).round() as i32)
    }
}

impl Default for AutoTagger {
    fn default() -> Self {
        Self::new()
    }
}

/// Batch tag multiple tracks
pub fn batch_tag(tracks: &[(i64, AudioFeatures, Option<String>, Option<String>)]) -> HashMap<i64, AutoTags> {
    let tagger = AutoTagger::new();
    let mut results = HashMap::new();
    
    for (id, features, title, artist) in tracks {
        let tags = tagger.tag(features, title.as_deref(), artist.as_deref());
        results.insert(*id, tags);
    }
    
    results
}
