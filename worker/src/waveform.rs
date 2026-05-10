use tracing::info;

/// Beat-grid data: beat positions, downbeat indices, confidence
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BeatGrid {
    /// Time of each detected beat in seconds
    pub beat_times: Vec<f64>,
    /// Indices in beat_times that are downbeats (first beat of bar)
    pub downbeat_indices: Vec<usize>,
    /// Detected phase offset: which beat in the bar is the first detected beat (0-3)
    pub phase_offset: u8,
    /// BPM used for grid alignment
    pub bpm: f64,
    /// Confidence 0.0-1.0 based on grid alignment quality
    pub confidence: f64,
}

/// Waveform peak data for rendering (min/max per pixel-width bucket)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WaveformData {
    /// Peak values per bucket (positive, for top half of waveform)
    pub peaks: Vec<f32>,
    /// RMS values per bucket (for thickness)
    pub rms: Vec<f32>,
    /// Total duration in seconds
    pub duration_sec: f64,
    /// Number of buckets
    pub buckets: usize,
}

/// Generate waveform peak data for a given pixel width
pub fn generate_waveform(samples: &[f32], sample_rate: u32, pixel_width: usize) -> WaveformData {
    let total_samples = samples.len();
    let buckets = pixel_width.max(100);
    let samples_per_bucket = (total_samples / buckets).max(1);
    let duration_sec = total_samples as f64 / sample_rate as f64;

    let mut peaks = Vec::with_capacity(buckets);
    let mut rms_vals = Vec::with_capacity(buckets);

    for chunk in samples.chunks(samples_per_bucket) {
        let max_abs = chunk.iter().map(|&s| s.abs()).fold(0.0_f32, f32::max);
        let rms = (chunk.iter().map(|&s| s * s).sum::<f32>() / chunk.len().max(1) as f32).sqrt();
        peaks.push(max_abs);
        rms_vals.push(rms);
    }

    WaveformData {
        peaks,
        rms: rms_vals,
        duration_sec,
        buckets,
    }
}

/// Detect beat-grid using onset envelope + BPM alignment
pub fn detect_beat_grid(
    samples: &[f32],
    sample_rate: u32,
    bpm: f64,
) -> BeatGrid {
    let hop_size = 512usize;
    let onset_env = compute_onset_envelope(samples, sample_rate, hop_size);
    let sr_hop = sample_rate as f64 / hop_size as f64;
    let beat_period_sec = 60.0 / bpm;
    let beat_period_frames = beat_period_sec * sr_hop;

    // Find the strongest onset peak to anchor the grid
    let global_peak_idx = onset_env
        .iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
        .map(|(i, _)| i)
        .unwrap_or(0);

    // Try 4 phase offsets (0-3 beats), pick the one that best aligns with onsets
    let mut best_offset = 0u8;
    let mut best_score = f64::NEG_INFINITY;
    let mut best_grid = Vec::new();

    for phase in 0..4 {
        let start_frame = global_peak_idx as f64 - phase as f64 * beat_period_frames;
        let start_frame = start_frame.max(0.0);
        let mut grid = Vec::new();
        let mut f = start_frame;
        while f < onset_env.len() as f64 {
            grid.push(f);
            f += beat_period_frames;
        }

        let score: f64 = grid.iter().map(|&fi| {
            let idx = (fi as usize).min(onset_env.len() - 1);
            onset_env[idx] as f64
        }).sum::<f64>() / grid.len().max(1) as f64;

        if score > best_score {
            best_score = score;
            best_offset = phase;
            best_grid = grid;
        }
    }

    // Convert frame indices to seconds
    let beat_times: Vec<f64> = best_grid.iter().map(|&f| f / sr_hop).collect();

    // Mark every 4th beat as a downbeat, shifted by phase
    let first_downbeat = ((4 - best_offset as usize) % 4).min(beat_times.len().saturating_sub(1));
    let downbeat_indices: Vec<usize> = (first_downbeat..beat_times.len()).step_by(4).collect();

    // Compute confidence: average onset strength at grid vs random positions
    let grid_strength: f64 = best_grid.iter().map(|&fi| {
        let idx = (fi as usize).min(onset_env.len() - 1);
        onset_env[idx] as f64
    }).sum::<f64>() / best_grid.len().max(1) as f64;

    let mean_onset: f64 = onset_env.iter().map(|&v| v as f64).sum::<f64>() / onset_env.len() as f64;
    let confidence = (grid_strength / (mean_onset + 1e-10)).min(1.0);

    info!(
        "Beat-grid: {} beats, {} downbeats, phase={}, confidence={:.2}",
        beat_times.len(),
        downbeat_indices.len(),
        best_offset,
        confidence
    );

    BeatGrid {
        beat_times,
        downbeat_indices,
        phase_offset: best_offset,
        bpm,
        confidence,
    }
}

/// Compute onset envelope: half-wave rectified spectral flux
fn compute_onset_envelope(samples: &[f32], sample_rate: u32, hop_size: usize) -> Vec<f32> {
    let window_size = hop_size * 2;
    let fft_size = window_size.next_power_of_two();
    let mut planner = rustfft::FftPlanner::new();
    let fft = planner.plan_fft_forward(fft_size);

    let mut onset_env = Vec::new();
    let mut prev_mag = vec![0.0f32; fft_size / 2];

    for frame_start in (0..samples.len().saturating_sub(window_size)).step_by(hop_size) {
        let mut buf: Vec<rustfft::num_complex::Complex<f32>> = (0..fft_size)
            .map(|i| {
                let s = if i < window_size {
                    samples[frame_start + i]
                } else {
                    0.0
                };
                let windowed = s * hann_window(i, window_size);
                rustfft::num_complex::Complex::new(windowed, 0.0)
            })
            .collect();

        fft.process(&mut buf);

        let mut flux = 0.0f32;
        for (i, c) in buf.iter().take(fft_size / 2).enumerate() {
            let mag = (c.norm() / fft_size as f32).sqrt();
            let diff = mag - prev_mag[i];
            if diff > 0.0 {
                flux += diff;
            }
            prev_mag[i] = mag;
        }

        onset_env.push(flux);
    }

    // Normalize
    let max_val = onset_env.iter().copied().fold(0.0f32, f32::max).max(1e-10);
    for v in &mut onset_env {
        *v /= max_val;
    }

    onset_env
}

fn hann_window(i: usize, size: usize) -> f32 {
    let pi = std::f32::consts::PI;
    let phase = 2.0 * pi * i as f32 / (size as f32 - 1.0);
    0.5 * (1.0 - phase.cos())
}

/// Cue point type for DJ performance
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CueType {
    Intro,
    Drop,
    Breakdown,
    Buildup,
    Outro,
    EnergyPeak,
    EnergyValley,
}

/// Auto-detected cue point
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CuePoint {
    /// Time in seconds
    pub time_sec: f64,
    /// Cue type
    pub cue_type: CueType,
    /// Confidence 0.0-1.0
    pub confidence: f64,
    /// Energy level at this point (0.0-1.0)
    pub energy: f64,
}

/// Detect cue points from energy envelope
pub fn detect_cue_points(
    samples: &[f32],
    sample_rate: u32,
    beat_grid: &BeatGrid,
) -> Vec<CuePoint> {
    let window_sec = 0.5f64; // 500ms windows
    let window_samples = (window_sec * sample_rate as f64) as usize;
    let hop_samples = window_samples / 2;

    // Compute short-term RMS energy envelope
    let mut energy_env: Vec<f64> = Vec::new();
    let mut times: Vec<f64> = Vec::new();

    for start in (0..samples.len().saturating_sub(window_samples)).step_by(hop_samples) {
        let slice = &samples[start..start + window_samples];
        let rms = (slice.iter().map(|&s| (s as f64).powi(2)).sum::<f64>() / slice.len() as f64).sqrt();
        energy_env.push(rms);
        times.push(start as f64 / sample_rate as f64);
    }

    if energy_env.is_empty() {
        return Vec::new();
    }

    // Normalize energy
    let max_energy = energy_env.iter().copied().fold(0.0_f64, f64::max).max(1e-10);
    for v in &mut energy_env {
        *v /= max_energy;
    }

    // Smooth with simple moving average
    let smoothed = smooth(&energy_env, 5);

    // Find peaks and valleys
    let mut peaks: Vec<(usize, f64)> = Vec::new();
    let mut valleys: Vec<(usize, f64)> = Vec::new();

    for i in 2..smoothed.len().saturating_sub(2) {
        let prev = smoothed[i - 1];
        let curr = smoothed[i];
        let next = smoothed[i + 1];

        if curr > prev && curr > next && curr > 0.3 {
            peaks.push((i, curr));
        } else if curr < prev && curr < next && curr < 0.4 {
            valleys.push((i, curr));
        }
    }

    let mut cues: Vec<CuePoint> = Vec::new();
    let duration = times.last().copied().unwrap_or(0.0);

    // Intro: first significant energy rise after start
    if !energy_env.is_empty() {
        let intro_threshold = 0.15;
        for (i, &e) in energy_env.iter().enumerate() {
            if times[i] > 3.0 && e > intro_threshold {
                let first_downbeat = beat_grid.beat_times.first().copied().unwrap_or(0.0);
                let time = times[i].max(first_downbeat);
                cues.push(CuePoint {
                    time_sec: time,
                    cue_type: CueType::Intro,
                    confidence: (e / 0.5).min(1.0),
                    energy: e,
                });
                break;
            }
        }
    }

    // Drop: first major energy peak after intro (first 1/3 of track)
    let first_third = duration / 3.0;
    for &(idx, e) in &peaks {
        let t = times[idx];
        if t > 5.0 && t < first_third {
            cues.push(CuePoint {
                time_sec: t,
                cue_type: CueType::Drop,
                confidence: e.min(1.0),
                energy: e,
            });
            break;
        }
    }

    // Breakdown: major valley after a drop (middle 1/3)
    let second_third = duration * 2.0 / 3.0;
    for &(idx, e) in &valleys {
        let t = times[idx];
        if t > first_third && t < second_third && e < 0.25 {
            cues.push(CuePoint {
                time_sec: t,
                cue_type: CueType::Breakdown,
                confidence: (1.0 - e).min(1.0),
                energy: e,
            });
            break;
        }
    }

    // Buildup: rise before a drop (if no drop found, find any major peak)
    if let Some(drop) = cues.iter().find(|c| c.cue_type == CueType::Drop) {
        let drop_time = drop.time_sec;
        // Look for buildup ~4-16s before drop
        for &(idx, e) in peaks.iter().rev() {
            let t = times[idx];
            let before_drop = drop_time - t;
            if before_drop > 2.0 && before_drop < 20.0 {
                cues.push(CuePoint {
                    time_sec: t,
                    cue_type: CueType::Buildup,
                    confidence: e.min(1.0),
                    energy: e,
                });
                break;
            }
        }
    }

    // Outro: energy drop in last 1/4
    let last_quarter = duration * 0.75;
    for &(idx, e) in valleys.iter().rev() {
        let t = times[idx];
        if t > last_quarter && e < 0.2 {
            cues.push(CuePoint {
                time_sec: t,
                cue_type: CueType::Outro,
                confidence: (1.0 - e).min(1.0),
                energy: e,
            });
            break;
        }
    }

    // Sort by time
    cues.sort_by(|a, b| a.time_sec.partial_cmp(&b.time_sec).unwrap());

    info!("Detected {} cue points", cues.len());
    for cue in &cues {
        info!("  {:?} @ {:.1}s (conf={:.2})", cue.cue_type, cue.time_sec, cue.confidence);
    }

    cues
}

fn smooth(data: &[f64], window: usize) -> Vec<f64> {
    let half = window / 2;
    (0..data.len())
        .map(|i| {
            let start = i.saturating_sub(half);
            let end = (i + half + 1).min(data.len());
            let slice = &data[start..end];
            slice.iter().sum::<f64>() / slice.len() as f64
        })
        .collect()
}

/// Serialize waveform to compact JSON for IPC
pub fn waveform_to_json(data: &WaveformData) -> String {
    serde_json::to_string(data).unwrap_or_else(|_| "{}".to_string())
}

/// Serialize beat-grid to compact JSON for IPC
pub fn beatgrid_to_json(grid: &BeatGrid) -> String {
    serde_json::to_string(grid).unwrap_or_else(|_| "{}".to_string())
}

/// Serialize cue points to JSON
pub fn cues_to_json(cues: &[CuePoint]) -> String {
    serde_json::to_string(cues).unwrap_or_else(|_| "[]".to_string())
}
