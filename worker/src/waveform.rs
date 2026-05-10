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

/// Serialize waveform to compact JSON for IPC
pub fn waveform_to_json(data: &WaveformData) -> String {
    serde_json::to_string(data).unwrap_or_else(|_| "{}".to_string())
}

/// Serialize beat-grid to compact JSON for IPC
pub fn beatgrid_to_json(grid: &BeatGrid) -> String {
    serde_json::to_string(grid).unwrap_or_else(|_| "{}".to_string())
}
