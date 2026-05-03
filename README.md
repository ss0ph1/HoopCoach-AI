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

OpenAI, PostgreSQL, OpenCV, and MediaPipe stay on the backend. The mobile app only uploads media and displays returned results.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, Axios.
- Backend: Python, FastAPI, RESTful APIs, python-dotenv.
- Database: PostgreSQL with SQLAlchemy ORM and Alembic migrations.
- AI: OpenAI Python SDK with structured JSON workout output.
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
