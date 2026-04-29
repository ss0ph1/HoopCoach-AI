# HoopFlow AI

HoopFlow AI is an AI-powered basketball training assistant. Players enter their time, focus skills, skill level, equipment, and gym preference, then receive a structured workout with drill instructions and YouTube tutorial search links.

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

The backend runs on `http://localhost:4000` and the frontend runs on `http://localhost:5173`.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, Axios.
- Backend: Python, FastAPI, RESTful APIs, python-dotenv.
- Database: PostgreSQL with SQLAlchemy ORM and Alembic migrations.
- AI: OpenAI Python SDK.
- Validation: Pydantic.
- Development: Uvicorn hot reload.
- Deployment target: Vercel for frontend, Render or Railway for backend, Supabase PostgreSQL or Railway PostgreSQL for database.
- Future ML extension: OpenCV, MediaPipe, and PyTorch or TensorFlow for video analysis.
