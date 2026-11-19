# HoopCoach

HoopCoach is an AI-powered basketball training assistant. Players enter their time, focus skills, skill level, equipment, and gym preference, then receive a structured workout with drill instructions and tutorial links. The app also includes beginner-friendly form analysis for short basketball training videos.

## Project Structure

- `backend/`: Python, FastAPI REST API.
- `backend/app/api/routes/`: API route definitions.
- `backend/app/schemas/`: Pydantic request and response models.
- `backend/app/services/`: Business logic, AI workout generation, and YouTube link helpers.
- `backend/app/repositories/`: Database read/write functions.
- `backend/app/db/`: SQLAlchemy database setup and models.
- `backend/alembic/`: Alembic migration environment.
- `frontend/`: React, TypeScript, Vite UI with Tailwind CSS.
- `frontend/src/components/`: Reusable UI pieces.
- `frontend/src/pages/`: Page-level app screens.

## Setup

HoopCoach uses Node 20 LTS. If you use `nvm`, run:

   ```bash
   nvm use
   ```

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create backend environment variables:

   ```bash
   cp backend/.env.example backend/.env
   ```

3. Create and install the backend Python environment:

   ```bash
   python3 -m venv backend/.venv
   backend/.venv/bin/pip install -r backend/requirements.txt
   ```

4. Create the database tables with Alembic:

   ```bash
   cd backend
   .venv/bin/alembic upgrade head
   cd ..
   ```

5. Run both apps:

   ```bash
   npm run dev
   ```

The backend runs on `http://localhost:4010` and the frontend usually runs on `http://localhost:5173`. Vite may choose a higher port if `5173` is already busy.

## Mobile App

The `mobile/` workspace is an Expo + React Native version of HoopCoach AI. It uses Expo Router, TypeScript, NativeWind, Axios, AsyncStorage, `expo-image-picker`, `expo-file-system`, and `expo-av`.

Run it with:

   ```bash
   npm run mobile:dev
   ```

Use Expo Go to scan the QR code, or build later with EAS Build. The mobile app calls the same FastAPI backend as the web app. Set the API URL in `mobile/.env`:

   ```bash
   EXPO_PUBLIC_API_BASE_URL=http://localhost:4010
   ```

For a physical phone, replace `localhost` with your computer's local network IP address, for example:

   ```bash
   EXPO_PUBLIC_API_BASE_URL=http://192.168.1.25:4010
   ```

Gemini, PostgreSQL, OpenCV, and MediaPipe stay on the backend. The mobile app only uploads media and displays returned results.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, Axios.
- Backend: Python, FastAPI, RESTful APIs, python-dotenv.
- Database: PostgreSQL with SQLAlchemy ORM and Alembic migrations.
- AI: Gemini API with structured JSON workout output.
- Validation: Pydantic.
- Development: Uvicorn hot reload.
- Deployment target: Vercel for frontend, Render or Railway for backend, Supabase PostgreSQL or Railway PostgreSQL for database.
- Computer vision: OpenCV and MediaPipe Pose for simple pose-based analysis.

## Form Analysis

The Form Analysis page supports short, single-player training videos:

- Shooting Video Analysis
- Dribbling Video Analysis

The backend uses OpenCV to read video frames and MediaPipe Pose to estimate body landmarks such as shoulders, elbows, wrists, hips, knees, ankles, and nose. The analyzers sample frames for speed and return simple, explainable measurements and feedback. This is not professional biomechanics analysis.

HoopCoach AI integrates AWS S3-backed video storage for uploaded shooting and dribbling clips, enabling a FastAPI computer vision pipeline with OpenCV and MediaPipe to analyze pose landmarks and store form-analysis results in PostgreSQL.

### Shooting Video Analysis

Endpoint:

```bash
POST /api/analysis/shooting-video
```

Example request:

```bash
curl -X POST http://localhost:4010/api/analysis/shooting-video \
  -F "file=@shooting-video.mp4"
```

Measures:

- average elbow angle
- estimated release elbow angle
- shoulder tilt
- body lean
- knee bend
- follow-through hold

### Dribbling Video Analysis

Endpoint:

```bash
POST /api/analysis/dribbling-video
```

Example request:

```bash
curl -X POST http://localhost:4010/api/analysis/dribbling-video \
  -F "file=@dribbling-video.mp4"
```

Measures:

- average knee bend
- average body lean
- head-down percentage
- stance stability
- estimated ball height

Ball height uses optional simple orange-color detection. If the ball is not clear enough, HoopCoach returns `unknown`.

## Cloud Video Storage with AWS S3

When a user uploads a shooting or dribbling video, the FastAPI backend:

- receives the multipart video upload
- temporarily saves the video for OpenCV processing
- uploads the original video to AWS S3
- runs the OpenCV + MediaPipe form analysis
- stores the S3 object key, S3 URL, analysis type, score, feedback, and measurements in PostgreSQL
- returns the analysis result to the frontend

Required backend environment variables:

```bash
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ca-central-1
AWS_S3_BUCKET_NAME=
```

Create an S3 bucket in AWS, copy the bucket name into `AWS_S3_BUCKET_NAME`, and keep AWS credentials only in `backend/.env`. The frontend and mobile app never talk directly to S3 and never store AWS credentials.

Uploaded videos are stored with keys like:

```text
training-videos/shooting/{uuid}.mp4
training-videos/dribbling/{uuid}.mp4
```

Analysis results are saved in the PostgreSQL `video_analyses` table. Run migrations after pulling this feature:

```bash
cd backend
.venv/bin/alembic upgrade head
```

Example curl request:

```bash
curl -X POST http://localhost:4010/api/analysis/shooting-video \
  -F "file=@shooting-video.mp4"
```

Example Postman or Thunder Client request:

- Method: `POST`
- URL: `http://localhost:4010/api/analysis/dribbling-video`
- Body: `form-data`
- Key: `file`
- Type: `File`
- Value: choose a short `.mp4`, `.mov`, `.avi`, or `.webm`

Limitations:

- Videos should be under 10 seconds.
- Works best with one clearly visible player.
- Best with side or front view.
- No full-game stat tracking.
- Ball detection is optional and may return `unknown`.
- This is not a substitute for professional coaching.

### Limitations

- Works best with clear, single-player videos.
- Best with side or front view.
- Videos must be under 10 seconds.
- No full-game stat tracking.
- No made/missed shot detection.
- No rebound, turnover, or possession analysis.
- Ball detection is optional and may return `unknown`.
- Not a substitute for professional coaching.

## Shooting Form Photo Analyzer

The `/shooting-analysis` page lets a user upload one basketball shooting photo. The FastAPI backend reads the image with OpenCV and uses MediaPipe Pose to find body landmarks. MediaPipe landmarks are normalized body points such as shoulders, elbows, wrists, and hips.

The analyzer uses simple geometry:

- Shooting elbow angle: compares the shoulder-to-elbow vector with the wrist-to-elbow vector.
- Shoulder balance: compares left and right shoulder height.
- Body lean: compares the shoulder midpoint with the hip midpoint.

This is intentionally a beginner-friendly estimate, not professional biomechanics analysis. Photo analysis is easier than video analysis because the backend only evaluates one frame instead of tracking motion across many frames. Later, this can grow into video analysis by extracting frames with OpenCV, running MediaPipe Pose on each frame, and summarizing how form changes through the shooting motion.


### Same-domain AI deployment (Vercel)

The website now includes `/api/health` and `/api/workouts/generate` as Vercel Functions. Deploy from the repository root, or deploy `frontend/` as a standalone project with its own `vercel.json`. Leave `VITE_API_BASE_URL` unset to use these same-domain endpoints; set it only when using the separate Python backend.

Gemini is the default AI provider. Create a key at https://aistudio.google.com/apikey using a Google project on the **Free tier** (do not enable billing if you want zero API charges). In Vercel Settings → Environment Variables, set `GEMINI_API_KEY`, then redeploy. `GEMINI_MODEL` defaults to `gemini-3.5-flash-lite`. For local development, add these server variables to `frontend/.env.local` or `backend/.env` and restart the server. Never use a `VITE_` prefix for API keys. Free-tier quotas apply; quota failures are shown as errors and never switch to a paid provider. Free-tier prompts may be used by Google to improve its products. See [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing). The health endpoint reports configuration presence only; a successful generation is required to verify credentials and availability.

Generation uses Gemini's structured JSON output and validates section presence, equipment and exact duration. Successful results identify the provider and model, plus a response ID when available. Workout generation uses only `GEMINI_API_KEY`; legacy `AI_PROVIDER` and `OPENAI_API_KEY` settings are ignored. Missing credentials, provider errors, timeouts, invalid duration and unsupported equipment produce errors; there is no automatic sample-plan fallback.

The website offers email/password sign up and sign in, plus guest access. Account profiles, generated workouts, feedback, video-analysis summaries, and completed-workout progress are saved to PostgreSQL through `/api/account`. Account data is scoped to the signed-in owner and syncs across devices. Passwords use salted scrypt hashes; session cookies are HttpOnly, SameSite=Lax, and Secure in production, and sessions expire after 30 days. Sign-in attempts are rate limited in the database.

Set `DATABASE_URL` to a persistent PostgreSQL connection string in both production and preview environments before deploying. A pooled Neon connection from Vercel Marketplace works; an existing hosted PostgreSQL database also works. Keep this variable server-side, with no `VITE_` prefix. The account API initializes its `hc_accounts`, `hc_sessions`, `hc_records`, and `hc_auth_attempts` tables on first access, so the database role needs table/index creation privileges. These tables are separate from the older Python backend tables; existing unowned backend records are not assigned to new accounts.

Guests keep up to 50 workouts, feedback, a profile, and completed-workout progress in this browser's local storage. Guest records are separate from account records and are not automatically imported on sign in. Signing out clears the session, and signing in again restores the account's records. Completing a workout saves the completed drill minutes automatically; failed saves show a retry button. Progress reflects saved completions and actual analysis scores, with empty states for new accounts. Feedback saves notes without automatically changing the workout. The web app now processes photo, shooting-video and dribbling-video analysis on-device; the older mobile/API clients still use the Python backend.

For local development, the Vite account middleware reads `DATABASE_URL` from `frontend/.env.local` or `backend/.env` and otherwise uses `postgresql://127.0.0.1:5433/hoopflow_ai`. Local generation and health use the same Node handlers as Vercel, with server-only AI provider configuration read from the same environment files. Other API routes, including analysis, proxy to the Python backend on port 4010. Signed-in generation always uses the same-domain handler so private workouts are not also copied into the legacy unowned Python workout history. The same-domain Vercel account endpoint stays independent of `VITE_API_BASE_URL`.

Validation: `npm run build --workspace frontend` and `node --test frontend/tests/generate.test.mjs`. Provider success tests use a mocked response; live AI generation requires a valid Gemini key with available quota.

Current standalone deployment: https://hoopcoach-live.vercel.app (project `hoopcoach-live`, ID `prj_FIXEtOfu95Rj0l96EJPZud48Vw4p`, owner `syzheng9-1351`). Server environment settings: https://vercel.com/syzheng9-1351/hoopcoach-live/settings/environment-variables. The existing `.vercel` links still refer to the earlier projects; explicitly link a clean standalone copy of `frontend/` to `hoopcoach-live` before future deployments. The Gemini-only account-enabled source is deployed to production. A live generation returned HTTP 201 using Gemini; GEMINI_API_KEY is configured. Neon PostgreSQL is connected through DATABASE_URL in production. Live browser verification passed signup, session restoration after reload, Gemini generation, workout persistence, sign-out, and sign-in restoring the saved workout; the verification workout was removed afterward. Use the stable https://hoopcoach-live.vercel.app alias rather than older immutable deployment URLs.


Account verification: `node --test frontend/tests/accounts.test.mjs` runs password-hashing checks. Set `TEST_DATABASE_URL` to a disposable or local PostgreSQL database to also run the full persistence/isolation test; it creates and removes a randomly named isolated schema. For example:

```bash
TEST_DATABASE_URL=postgresql://127.0.0.1:5433/hoopflow_ai node --test frontend/tests/accounts.test.mjs frontend/tests/generate.test.mjs
```

The account API deliberately returns an error when database storage is unavailable; it never pretends that a browser-only account is a synced account.


### On-device photo and dribbling analysis

The web app processes shooting photos and dribbling clips locally with MediaPipe Pose Landmarker (Tasks Vision 1.2.3, CPU WebAssembly). The model/runtime download on first use. Those files are not sent to the missing Python upload endpoints or to S3. Signed-in users can still save dribbling result summaries to their account. Shooting-video analysis also runs on-device, removing its unavailable upload endpoint dependency.

Dribbling uses pixel-correct joint angles, confidence checks, bounded frame sampling, and orange-component shape/position filtering instead of selecting the largest orange region. Ball-height feedback requires consistent ball detections and vertical motion relative to the player's torso. Uncertain ball tracking, gaze and stance stability are not scored. A still image or a pan over a photo produces posture-only feedback. These camera-view heuristics are not a validated skill rating.

The shooting-photo panel shares the dark analysis cards and orange controls used by the video tabs. Shoulder height difference is displayed as a percentage of image height rather than incorrectly as degrees; decorative overlays unrelated to detected joints were removed.

Analysis checks: `node --test frontend/tests/dribbling.test.mjs`, the backend unittest suite, and real browser photo/dribbling inference on the synthetic fixtures. Blank clips are rejected; the mobile photo view is checked at 390px width.


### Shooting-video upload error fix

All web analysis now uses the browser MediaPipe model. Shooting-video uploads no longer call the unavailable `/api/analysis/shooting-video` endpoint or depend on S3 configuration. A shared readable-error formatter handles nested service errors and validation arrays without producing `[object Object]`.

Shooting feedback follows one visible arm through the clip and reports a possible release only when upward motion and elbow extension are observed. Stationary clips remain posture-only; missing release/follow-through evidence is shown as unknown. This is a camera-view estimate rather than proof of a shot or a measured shooting-accuracy score.

Verification: `node --test frontend/tests/shooting-video.test.mjs frontend/tests/dribbling.test.mjs frontend/tests/generate.test.mjs`; production build; real browser inference plus invalid-codec, over-10-second, and blank-video error checks. No demo responses are used in these inference checks.

### Experimental shooting observations and evidence

Shooting-video capture setup accepts side, front, oblique, or unknown views and asks whether the camera stayed fixed and level. All views can attempt basic visible-pose feedback. New observations are excluded from the heuristic check index:

- Fixed side view: visible knee/hip extension around an arm-extension candidate, with optional ankle-angle change and hip rise normalized by torso length. Joint movement does not measure muscle effort, ground-reaction force, power, or the fraction of shot energy supplied by the legs.
- Fixed side view with ball tracking: generic EfficientDet-Lite0 COCO sports-ball detections, hand association, continuity/ambiguity gates, and a projected quadratic arc. Requires observed ascent, apex, and descent; reports rise above the first tracked flight point as a percentage of frame height and early visible 2D direction. No absolute meters, calibrated release/entry angle, or unseen apex extrapolation.
- Fixed front view: median projected knee offset from each hip–ankle reference line, normalized by projected leg length, with an actual-joint diagram. This is not a force vector, clinical valgus diagnosis, injury-risk estimate, or ideal-alignment grade.

Unknown, oblique, moving-camera, occluded, and insufficient samples return explicit unavailable observations. Sampling is approximately 12 frames/second, capped at 120 frames in a clip of at most 10 seconds; brief phases can be missed. The camera selection is a user description, not automatic calibration. The ball detector is generic and has not been validated for basketball flight. Browser inference is checked on synthetic fixtures; calculation tests use known synthetic geometry and trajectories. Accuracy against real annotated shots remains unvalidated.

References inform the scope and limitations; none validates this app or its thresholds:

- BlazePose: https://arxiv.org/abs/2006.10204 — keypoint estimation background.
- MediaPipe object detector: https://developers.google.com/edge/mediapipe/solutions/vision/object_detector — generic model documentation.
- Free-throw biomechanics (2023): https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2023.1208915/full — calibrated multi-camera kinematics.
- Jump-shot biomechanics (2014): https://doi.org/10.2478/hukin-2014-0062 — lower-limb force-plate/motion-analysis research.

Verification: `node --test frontend/tests/*.test.mjs` and `npm run build --workspace frontend`. The database integration test requires TEST_DATABASE_URL and otherwise skips. New tests cover known projected arcs, singular fits, wrong-angle/moving-camera gates, held balls, unseen apexes, ambiguous detections, front-view alignment, and leg-extension sequences.

### Clickable video thumbnails and temporary AI failures

Selected videos show an actual-frame thumbnail that opens an accessible native video dialog. Successfully analyzed clips are kept as blobs in IndexedDB, keyed by account scope and saved analysis ID. History and Progress cards reopen the video after page reload. Media remains in this browser on this device; only analysis summaries sync through accounts. Older entries, other devices, cleared storage, or storage failures show a file-selection flow to restore the thumbnail and playback. Original videos are not uploaded to a public URL or stored in localStorage.

Production logs showed Gemini HTTP 503 responses behind the misleading API-key error. Workout generation now retries transient 408/5xx, timeout and network failures up to three attempts with jittered backoff and a 52-second budget. Authentication/configuration errors and free-tier quota errors are not retried. Persistent overload returns a temporary-unavailability error without blaming focus tags or credentials. All skill pairs and the shooting/ball-handling/finishing trio remain valid; the UI visibly disables a fourth focus choice. Regression tests cover recovery, bounded retries, quota/configuration handling, all UI skill pairs, and the reported trio.
