# DJ Curation — Phase 1 Plan

## Vision
A desktop-first DJ music library preparation tool that bridges the gap between raw music folders and performance-ready Rekordbox crates. Built around AI-powered auto-tagging, spatial visualization, and narrative chapter-based set design.

## Core Principles
- **Local-first:** All data, models, and analysis run on-device. No cloud dependency.
- **Privacy-respecting:** Your music library never leaves your machine.
- **Speed:** Sub-second search across 50K+ tracks. Analysis that keeps up with your workflow.
- **Visual:** Curation happens through seeing relationships, not scrolling lists.

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| UI Shell | Electron + Vite + React 19 + TypeScript + Tailwind CSS | Familiar web ecosystem, fast iteration, great ecosystem for visualization |
| Visualization | Three.js (Scatter Map) + D3 (Graph) | Proven, performant, well-documented |
| State | Zustand + React Query | Simple, effective, no boilerplate |
| Native Worker | Rust + Cargo | Zero-cost abstractions, safe concurrency, native audio/ML performance |
| Audio | FFmpeg (decoding) + miniaudio (playback) | Industry standard, cross-platform |
| ML Tags | ONNX Runtime (`ort` crate) | Fast inference, model portability |
| LLM | llama.cpp (`llama-cpp-2` crate) + Qwen3.5-0.8B-Q4_K_M | Local inference, 500MB model, no API keys needed |
| Database | SQLite (`rusqlite`) | Zero-config, battle-tested, perfect for local-first |
| Export | `quick-xml` (Rust) | Fast, streaming XML generation for Rekordbox |
| IPC | JSON Lines over stdin/stdout | Simple, debuggable, works everywhere |

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Electron Main Process (Node.js)        │
│  - Window management                    │
│  - Spawn Rust worker                    │
│  - IPC bridge                           │
└─────────────┬───────────────────────────┘
              │ IPC (JSON Lines)
┌─────────────▼───────────────────────────┐
│  Rust Native Worker                     │
│  ├── Audio Analyzer (FFmpeg)            │
│  ├── ML Pipeline (ONNX Runtime)         │
│  ├── LLM Inference (llama.cpp)          │
│  ├── Database (SQLite)                  │
│  └── Rekordbox Bridge (XML Writer)      │
└─────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│  Electron Renderer (React + Three.js)   │
│  - Track Library Browser                │
│  - Scatter Map (Three.js point cloud)   │
│  - Graph Playlist (D3 force-directed)   │
│  - Chapter Builder                      │
│  - Settings & Onboarding                │
└─────────────────────────────────────────┘
```

---

## Project Structure

```
djcuration/
├── PLAN.md                 # This document
├── README.md               # Getting started guide
├── package.json            # Electron + frontend deps
├── vite.config.ts          # Vite + Electron plugin
├── tsconfig.json           # TypeScript config
├── electron/               # Electron main process
│   ├── main.ts             # Entry point
│   ├── preload.ts          # Context bridge
│   └── ipc/                # IPC handlers
├── src/                    # React frontend
│   ├── main.tsx            # React entry
│   ├── App.tsx             # Root component
│   ├── components/         # UI components
│   ├── pages/              # Route-level pages
│   ├── stores/             # Zustand stores
│   ├── hooks/              # Custom React hooks
│   └── lib/                # Utilities, API clients
├── worker/                 # Rust native worker
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs         # Entry + IPC loop
│   │   ├── audio.rs        # FFmpeg decoding
│   │   ├── features.rs     # Feature extraction
│   │   ├── ml.rs           # ONNX inference
│   │   ├── llm.rs          # llama.cpp integration
│   │   ├── db.rs           # SQLite layer
│   │   ├── models.rs       # Data structures
│   │   ├── rekordbox.rs    # XML export
│   │   └── ipc.rs          # JSON Lines protocol
│   └── models/             # Downloaded ONNX weights
├── docs/                   # Documentation
└── scripts/                # Build + dev scripts
```

---

## Milestones

### M1: Foundation (Weeks 1-3)
**Goal:** Working Electron app with file scanning and database.

| Task | Acceptance Criteria |
|------|-------------------|
| Scaffold Electron + Vite + React + Tailwind | `npm run dev` launches app in <3s |
| Scaffold Rust worker | `cargo run` starts worker, responds to ping |
| IPC protocol | JSON Lines over stdin/stdout, typed commands |
| File scanner | Recursive scan, detect `.mp3`, `.flac`, `.wav`, `.aiff`, `.m4a` |
| SQLite schema | Tracks, features, chapters, edges, settings tables |
| Track import | Parse metadata (ID3, Vorbis, FLAC) via `lofty-rs` |
| Basic UI | Scrollable track list, folder drop zone, import progress |

**Checkpoint:** Drop a folder → see all tracks in a list with title, artist, album, duration.

### M2: Audio Analysis (Weeks 4-6)
**Goal:** Auto-tagging pipeline running locally.

| Task | Acceptance Criteria |
|------|-------------------|
| FFmpeg integration | Decode any supported audio to raw PCM |
| Feature extraction | 128-dim embedding (MFCC + chroma + spectral) |
| ONNX Runtime setup | Load and run models on CPU |
| Genre classifier | 20+ categories, confidence score |
| BPM detector | ±0.1 BPM accuracy |
| Key detector | Camelot notation (e.g., 4A, 7B) |
| Energy/danceability | 1-10 scale regression |
| Background queue | Parallel analysis, progress UI, cancelable |
| Tag UI | Display tags, editable, confidence indicator |

**Checkpoint:** Drop 100 tracks → all auto-tagged in <5 minutes on this machine (i7-10700F).

### M3: LLM Integration (Weeks 7-8)
**Goal:** Natural language search and intelligent descriptions.

| Task | Acceptance Criteria |
|------|-------------------|
| llama.cpp build | Static link, no external dependencies |
| Auto-download Qwen3.5-0.8B-Q4_K_M | Download from HuggingFace on first run, ~500MB |
| NL search | "dark techno peak time" → relevant tracks in <2s |
| Chapter descriptions | Auto-generate from track list |
| Smart naming | Suggest chapter names from track characteristics |

**Checkpoint:** Type natural language query → filtered, relevant track results.

### M4: Visual Curation (Weeks 9-11)
**Goal:** Scatter Map and Graph Playlist.

| Task | Acceptance Criteria |
|------|-------------------|
| UMAP dimensionality reduction | 2D coords from 128-dim embeddings |
| Three.js point cloud | 50K points at 60fps, zoom/pan/rotate |
| Color coding | Genre, energy, or custom tag |
| Lasso selection | Select region → create chapter/playlist |
| Force-directed graph | Track compatibility edges |
| Pre-listen player | 30s waveform preview, system audio out |
| Chapter Builder | Drag-drop, energy curve, chapter tracks |

**Checkpoint:** Scatter Map shows library as landscape. Lasso-select → create chapter.

### M5: Rekordbox Export + Polish (Weeks 12-14)
**Goal:** Export to Rekordbox, installer, performance.

| Task | Acceptance Criteria |
|------|-------------------|
| Rekordbox XML export | Valid XML, crates with tracks and metadata |
| Magic Sort | Harmonic + energy flow within chapters |
| Performance | <2s search on 50K tracks, <1s filter |
| Windows installer | NSIS `.exe` |
| Linux package | `.AppImage` |
| Onboarding | First-run tutorial, optional demo library |
| Settings | Library path, analysis threads, dark mode (always) |

**Checkpoint:** Complete workflow: Import → Analyze → Curate in Scatter Map → Export → Play on CDJs.

---

## Model Strategy

### Auto-download on First Run
```
~/.djcuration/
├── models/
│   ├── qwen3.5-0.8b-q4_k_m.gguf   # LLM (~500MB)
│   ├── genre_classifier.onnx       # Genre ML
│   ├── energy_regressor.onnx       # Energy ML
│   ├── bpm_detector.onnx           # BPM ML
│   └── key_detector.onnx           # Key ML
└── db/
    └── library.db                  # SQLite database
```

- Models downloaded from HuggingFace on first app launch
- Progress indicator during download
- Fallback: user can manually place `.gguf` and `.onnx` files
- Future: HuggingFace API token for gated models

---

## Database Schema

See `worker/src/db.rs` for full implementation. Key tables:

- `tracks` — core track metadata
- `track_features` — 128-dim embedding + spectral features
- `chapters` — set chapters with energy targets
- `chapter_tracks` — ordered tracks within chapters
- `track_edges` — pre-computed compatibility scores
- `settings` — user preferences
- `tracks_fts` — full-text search index

---

## Platforms

| Platform | Support | Package |
|----------|---------|---------|
| Windows 10/11 | Primary | `.exe` (NSIS) |
| Linux (Ubuntu/Debian/Fedora) | Secondary | `.AppImage` |

---

## Success Criteria

- [ ] Import 10,000 tracks in <2 minutes
- [ ] Auto-tag 100 tracks in <5 minutes (i7-10700F)
- [ ] Scatter Map renders 50,000 tracks at 60fps
- [ ] NL search returns results in <2s
- [ ] Rekordbox XML imports cleanly
- [ ] App launches in <3s
- [ ] Memory usage <500MB during normal use

---

## Out of Scope (Future Phases)

- Cloud sync / multi-device
- Mobile companion app
- Streaming service integration (Spotify, Tidal, Beatport)
- Hardware controller support
- Community sharing
- Serato / Traktor / Engine Prime export
- ASIO / low-latency audio
- Video file support

---

## License

MIT — open source, GitHub-hosted for security and community.
