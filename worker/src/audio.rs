use std::path::Path;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use realfft::RealFftPlanner;
use realfft::num_complex::Complex;
use tracing::{info, warn};

/// Audio analysis result for a single track
#[derive(Debug, Clone)]
pub struct AudioAnalysis {
    pub bpm: f64,
    pub key: String,
    pub camelot_key: String,
    pub energy: i32,
    pub danceability: i32,
    pub emotion: String,
    pub spectral_centroid: f64,
    pub spectral_rolloff: f64,
    pub zero_crossing_rate: f64,
    pub rms_energy: f64,
    pub features: Vec<f32>,
}

/// Decode an audio file to mono f32 samples
pub fn decode_audio<P: AsRef<Path>>(path: P) -> Result<(Vec<f32>, u32), AudioError> {
    let path = path.as_ref();
    let file = std::fs::File::open(path)?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let meta_opts: MetadataOptions = Default::default();
    let fmt_opts: FormatOptions = Default::default();
    let decoder_opts: DecoderOptions = Default::default();

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &fmt_opts, &meta_opts)
        .map_err(|e| AudioError::Decode(format!("Probe failed: {}", e)))?;

    let mut format = probed.format;
    let track = format.tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| AudioError::Decode("No audio track found".to_string()))?;

    let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &decoder_opts)
        .map_err(|e| AudioError::Decode(format!("Decoder creation failed: {}", e)))?;

    let track_id = track.id;
    let mut samples = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(_) => break,
        };

        if packet.track_id() != track_id {
            continue;
        }

        match decoder.decode(&packet) {
            Ok(decoded) => {
                let channels = decoded.spec().channels.count();
                let mut sample_buf = SampleBuffer::<f32>::new(
                    decoded.capacity() as u64,
                    *decoded.spec(),
                );
                sample_buf.copy_planar_ref(decoded);

                // Convert to mono by averaging channels
                let buf_samples: Vec<f32> = sample_buf.samples().to_vec();

                for chunk in buf_samples.chunks(channels) {
                    let mono = chunk.iter().sum::<f32>() / channels as f32;
                    samples.push(mono);
                }
            }
            Err(e) => {
                warn!("Decode error: {}", e);
                continue;
            }
        }
    }

    info!("Decoded {} samples at {} Hz", samples.len(), sample_rate);
    Ok((samples, sample_rate))
}

/// Analyze audio samples and extract all features
pub fn analyze(samples: &[f32], sample_rate: u32) -> Result<AudioAnalysis, AudioError> {
    if samples.len() < 1024 {
        return Err(AudioError::Decode("Audio too short".to_string()));
    }

    let sr = sample_rate as f64;

    // Window parameters
    let hop_size = 512;
    let window_size = 2048;

    // Extract spectral features
    let (rms_values, spectral_centroids, spectral_rollofs, zcr_values) =
        extract_spectral_features(samples, sample_rate, window_size, hop_size);

    let rms_energy = rms_values.iter().sum::<f64>() / rms_values.len().max(1) as f64;
    let spectral_centroid = spectral_centroids.iter().sum::<f64>() / spectral_centroids.len().max(1) as f64;
    let spectral_rolloff = spectral_rollofs.iter().sum::<f64>() / spectral_rollofs.len().max(1) as f64;
    let zero_crossing_rate = zcr_values.iter().sum::<f64>() / zcr_values.len().max(1) as f64;

    // Detect BPM using onset detection + autocorrelation
    let bpm = detect_bpm(&rms_values, sr, hop_size as f64);

    // Detect key using chromagram
    let (key, camelot_key) = detect_key(samples, sample_rate, window_size, hop_size);

    // Estimate energy (1-10) based on RMS and spectral features
    let energy = estimate_energy(rms_energy, spectral_centroid, spectral_rolloff);

    // Estimate danceability based on rhythmic regularity and tempo
    let danceability = estimate_danceability(bpm, &rms_values);

    // Classify emotion based on spectral characteristics
    let emotion = classify_emotion(spectral_centroid, spectral_rolloff, rms_energy);

    // Extract 128-dim feature vector for similarity
    let features = extract_feature_vector(
        &rms_values, &spectral_centroids, &spectral_rollofs, &zcr_values,
    );

    Ok(AudioAnalysis {
        bpm,
        key,
        camelot_key,
        energy,
        danceability,
        emotion,
        spectral_centroid,
        spectral_rolloff,
        zero_crossing_rate,
        rms_energy,
        features,
    })
}

/// Extract spectral features per window
fn extract_spectral_features(
    samples: &[f32],
    sample_rate: u32,
    window_size: usize,
    hop_size: usize,
) -> (Vec<f64>, Vec<f64>, Vec<f64>, Vec<f64>) {
    let mut planner = RealFftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(window_size);
    let mut r2c = fft;

    let num_windows = (samples.len().saturating_sub(window_size)) / hop_size + 1;
    let mut rms = Vec::with_capacity(num_windows);
    let mut centroids = Vec::with_capacity(num_windows);
    let mut rollofs = Vec::with_capacity(num_windows);
    let mut zcr = Vec::with_capacity(num_windows);

    let sr = sample_rate as f64;
    let bin_freq = sr / window_size as f64;

    for i in 0..num_windows {
        let start = i * hop_size;
        let end = (start + window_size).min(samples.len());
        let window_len = end - start;

        if window_len < window_size / 2 {
            continue;
        }

        let mut window = vec![0.0f32; window_size];
        for j in 0..window_len {
            // Hann window
            let hann = 0.5 - 0.5 * (2.0 * std::f32::consts::PI * j as f32 / window_size as f32).cos();
            window[j] = samples[start + j] * hann;
        }

        // Compute FFT
        let mut spectrum = vec![Complex::new(0.0f32, 0.0f32); window_size / 2 + 1];
        if r2c.process(&mut window, &mut spectrum).is_err() {
            continue;
        }

        // Magnitude spectrum
        let magnitudes: Vec<f64> = spectrum.iter()
            .map(|c| (c.re as f64).hypot(c.im as f64))
            .collect();

        let sum_mag: f64 = magnitudes.iter().sum();

        // RMS energy
        let rms_val = (sum_mag.powi(2) / magnitudes.len().max(1) as f64).sqrt();
        rms.push(rms_val);

        // Spectral centroid
        let centroid = if sum_mag > 0.0 {
            magnitudes.iter().enumerate()
                .map(|(i, m)| i as f64 * bin_freq * m)
                .sum::<f64>() / sum_mag
        } else {
            0.0
        };
        centroids.push(centroid);

        // Spectral rolloff (85% energy)
        let rolloff = if sum_mag > 0.0 {
            let threshold = 0.85 * sum_mag;
            let mut cumsum = 0.0;
            let mut idx = 0;
            for (i, m) in magnitudes.iter().enumerate() {
                cumsum += m;
                if cumsum >= threshold {
                    idx = i;
                    break;
                }
            }
            idx as f64 * bin_freq
        } else {
            0.0
        };
        rollofs.push(rolloff);

        // Zero crossing rate
        let zcr_val = if window_len > 1 {
            let mut crossings = 0;
            for j in 1..window_len {
                if (window[j] >= 0.0) != (window[j - 1] >= 0.0) {
                    crossings += 1;
                }
            }
            crossings as f64 / window_len as f64
        } else {
            0.0
        };
        zcr.push(zcr_val);
    }

    (rms, centroids, rollofs, zcr)
}

/// Detect BPM using onset strength and autocorrelation
fn detect_bpm(rms_values: &[f64], sr: f64, hop_size: f64) -> f64 {
    // Onset detection: compute derivative of RMS
    let mut onset_env: Vec<f64> = Vec::with_capacity(rms_values.len());
    onset_env.push(0.0);
    for i in 1..rms_values.len() {
        let diff = rms_values[i] - rms_values[i - 1];
        onset_env.push(diff.max(0.0));
    }

    // Autocorrelation to find periodicity
    let tempo_lag_min = (60.0 / 200.0 * sr / hop_size) as usize; // 200 BPM max
    let tempo_lag_max = (60.0 / 60.0 * sr / hop_size) as usize;  // 60 BPM min

    let mut best_lag = tempo_lag_min;
    let mut best_corr = f64::NEG_INFINITY;

    for lag in tempo_lag_min..=tempo_lag_max.min(onset_env.len() / 2) {
        let mut corr = 0.0;
        let mut count = 0;
        for i in 0..onset_env.len() - lag {
            corr += onset_env[i] * onset_env[i + lag];
            count += 1;
        }
        if count > 0 {
            corr /= count as f64;
        }
        if corr > best_corr {
            best_corr = corr;
            best_lag = lag;
        }
    }

    let bpm = 60.0 / (best_lag as f64 * hop_size / sr);
    bpm.clamp(60.0, 200.0)
}

/// Detect musical key using chromagram analysis
fn detect_key(samples: &[f32], sample_rate: u32, window_size: usize, hop_size: usize) -> (String, String) {
    // 12 pitch classes
    let mut chromagram = [0.0f64; 12];

    let sr = sample_rate as f64;
    let bin_freq = sr / window_size as f64;

    // Note frequencies for C = 0, C# = 1, etc.
    let note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    let num_windows = (samples.len().saturating_sub(window_size)) / hop_size + 1;

    let mut planner = RealFftPlanner::<f32>::new();
    let r2c = planner.plan_fft_forward(window_size);

    for i in 0..num_windows.min(500) { // Analyze first 500 windows for efficiency
        let start = i * hop_size;
        let end = (start + window_size).min(samples.len());
        let window_len = end - start;

        if window_len < window_size / 2 {
            continue;
        }

        let mut window = vec![0.0f32; window_size];
        for j in 0..window_len {
            let hann = 0.5 - 0.5 * (2.0 * std::f32::consts::PI * j as f32 / window_size as f32).cos();
            window[j] = samples[start + j] * hann;
        }

        let mut spectrum = vec![Complex::new(0.0f32, 0.0f32); window_size / 2 + 1];
        if r2c.process(&mut window, &mut spectrum).is_ok() {
            let magnitudes: Vec<f64> = spectrum.iter()
                .map(|c| (c.re as f64).hypot(c.im as f64))
                .collect();

            for (bin, mag) in magnitudes.iter().enumerate() {
                let freq = bin as f64 * bin_freq;
                if freq < 20.0 || freq > 4000.0 {
                    continue;
                }

                // Map frequency to pitch class
                let midi_note = 69.0 + 12.0 * (freq / 440.0).log2();
                let pitch_class = ((midi_note.round() as i32).rem_euclid(12)) as usize;
                if pitch_class < 12 {
                    chromagram[pitch_class] += mag;
                }
            }
        }
    }

    // Find best matching key profile
    let (key_idx, is_major) = match_key_profile(&chromagram);

    let key_name = if is_major {
        format!("{} Major", note_names[key_idx])
    } else {
        format!("{} Minor", note_names[key_idx])
    };

    // Convert to Camelot notation
    let camelot = to_camelot(key_idx, is_major);

    (key_name, camelot)
}

/// Match chromagram against Krumhansl-Schmuckler key profiles
fn match_key_profile(chromagram: &[f64; 12]) -> (usize, bool) {
    // Major key profile (Krumhansl-Kessler)
    let major_profile = [
        6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
    ];
    // Minor key profile
    let minor_profile = [
        6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
    ];

    let mut best_score = f64::NEG_INFINITY;
    let mut best_key = 0usize;
    let mut best_is_major = true;

    for key in 0..12 {
        // Try major
        let mut major_score = 0.0;
        for pc in 0..12 {
            let shifted = (pc + 12 - key) % 12;
            major_score += chromagram[pc] * major_profile[shifted];
        }
        if major_score > best_score {
            best_score = major_score;
            best_key = key;
            best_is_major = true;
        }

        // Try minor
        let mut minor_score = 0.0;
        for pc in 0..12 {
            let shifted = (pc + 12 - key) % 12;
            minor_score += chromagram[pc] * minor_profile[shifted];
        }
        if minor_score > best_score {
            best_score = minor_score;
            best_key = key;
            best_is_major = false;
        }
    }

    (best_key, best_is_major)
}

/// Convert key to Camelot notation
fn to_camelot(key: usize, is_major: bool) -> String {
    // Camelot wheel: A = minor, B = major
    // C=8B, G=6B, D=7B, A=11B, E=12B, B=1B
    // F#=2B, C#=3B, G#=4B, D#=5B, A#=10B, F=7B (wait, F=7B is wrong)

    // Correct Camelot mapping:
    // Major: C=8B, C#=3B, D=12B, D#=5B, E=9B, F=4B, F#=11B, G=6B, G#=1B, A=8B (wait)

    // Simplified: use semitone position
    let num = match (key, is_major) {
        (0, true) => "8B",   // C Major
        (1, true) => "3B",   // C# Major
        (2, true) => "10B",  // D Major
        (3, true) => "5B",   // D# Major
        (4, true) => "12B",  // E Major
        (5, true) => "7B",   // F Major
        (6, true) => "2B",   // F# Major
        (7, true) => "9B",   // G Major
        (8, true) => "4B",   // G# Major
        (9, true) => "11B",  // A Major
        (10, true) => "6B",  // A# Major
        (11, true) => "1B",  // B Major
        (0, false) => "5A",  // C Minor
        (1, false) => "12A", // C# Minor
        (2, false) => "7A",  // D Minor
        (3, false) => "2A",  // D# Minor
        (4, false) => "9A",  // E Minor
        (5, false) => "4A",  // F Minor
        (6, false) => "11A", // F# Minor
        (7, false) => "6A",  // G Minor
        (8, false) => "1A",  // G# Minor
        (9, false) => "8A",  // A Minor
        (10, false) => "3A", // A# Minor
        (11, false) => "10A",// B Minor
        _ => "?",
    };

    num.to_string()
}

/// Estimate energy on 1-10 scale
fn estimate_energy(rms: f64, centroid: f64, rolloff: f64) -> i32 {
    // Normalize features to 0-1 range (approximate)
    let rms_norm = (rms * 10.0).min(1.0);
    let centroid_norm = (centroid / 8000.0).min(1.0);
    let rolloff_norm = (rolloff / 16000.0).min(1.0);

    let energy_score = (rms_norm * 0.5 + centroid_norm * 0.3 + rolloff_norm * 0.2) * 10.0;
    energy_score.clamp(1.0, 10.0).round() as i32
}

/// Estimate danceability on 1-10 scale
fn estimate_danceability(bpm: f64, rms_values: &[f64]) -> i32 {
    // Prefer tempos between 100-140 BPM
    let tempo_score = if bpm >= 100.0 && bpm <= 140.0 {
        1.0
    } else if bpm >= 80.0 && bpm <= 170.0 {
        0.7
    } else {
        0.4
    };

    // Rhythmic regularity (low variance in onset strength)
    let mean_rms = rms_values.iter().sum::<f64>() / rms_values.len().max(1) as f64;
    let variance = rms_values.iter()
        .map(|v| (v - mean_rms).powi(2))
        .sum::<f64>() / rms_values.len().max(1) as f64;
    let regularity = (-variance * 100.0).exp().clamp(0.0, 1.0);

    let dance_score = (tempo_score * 0.6 + regularity * 0.4) * 10.0;
    dance_score.clamp(1.0, 10.0).round() as i32
}

/// Classify emotion based on spectral features
fn classify_emotion(centroid: f64, rolloff: f64, rms: f64) -> String {
    let brightness = (centroid / 5000.0).clamp(0.0, 1.0);
    let energy = (rms * 5.0).clamp(0.0, 1.0);

    match (brightness, energy) {
        (b, e) if b > 0.7 && e > 0.6 => "euphoric",
        (b, e) if b > 0.5 && e > 0.5 => "energetic",
        (b, e) if b < 0.3 && e < 0.4 => "dark",
        (b, e) if b < 0.3 && e > 0.5 => "intense",
        (b, e) if b > 0.5 && e < 0.4 => "melancholic",
        (b, _) if b > 0.7 => "bright",
        (_, e) if e < 0.3 => "calm",
        _ => "balanced",
    }.to_string()
}

/// Extract 128-dim feature vector for similarity
fn extract_feature_vector(
    rms: &[f64],
    centroids: &[f64],
    rollofs: &[f64],
    zcr: &[f64],
) -> Vec<f32> {
    let mut features = Vec::with_capacity(128);

    // Statistical summaries of each feature (mean, std, min, max, percentiles)
    fn stats(values: &[f64]) -> [f64; 5] {
        if values.is_empty() {
            return [0.0; 5];
        }
        let mean = values.iter().sum::<f64>() / values.len() as f64;
        let min = values.iter().fold(f64::INFINITY, |a, b| a.min(*b));
        let max = values.iter().fold(f64::NEG_INFINITY, |a, b| a.max(*b));
        let variance = values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / values.len() as f64;
        let std = variance.sqrt();
        let p50 = percentile(values, 0.5);
        [mean, std, min, max, p50]
    }

    fn percentile(values: &[f64], p: f64) -> f64 {
        if values.is_empty() {
            return 0.0;
        }
        let mut sorted = values.to_vec();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let idx = (p * (sorted.len() - 1) as f64).round() as usize;
        sorted[idx.min(sorted.len() - 1)]
    }

    let rms_stats = stats(rms);
    let cent_stats = stats(centroids);
    let roll_stats = stats(rollofs);
    let zcr_stats = stats(zcr);

    for s in &rms_stats { features.push(*s as f32); }
    for s in &cent_stats { features.push(*s as f32); }
    for s in &roll_stats { features.push(*s as f32); }
    for s in &zcr_stats { features.push(*s as f32); }

    // Pad to 128 dimensions with zeros and derived features
    while features.len() < 128 {
        let idx = features.len();
        let derived = if idx >= 20 {
            features[idx - 20] * 0.5f32
        } else {
            0.0f32
        };
        features.push(derived);
    }

    features.truncate(128);
    features
}

#[derive(Debug, thiserror::Error)]
pub enum AudioError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Decode error: {0}")]
    Decode(String),
}
