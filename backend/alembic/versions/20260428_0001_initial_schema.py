"""initial schema

Revision ID: 20260428_0001
Revises:
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260428_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("email", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("email"),
    )
    op.create_table(
        "workout_requests",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("available_time_minutes", sa.Integer(), nullable=False),
        sa.Column("target_skills", postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("skill_level", sa.String(), nullable=False),
        sa.Column("equipment", postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("include_gym_workout", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "generated_workouts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column(
            "workout_request_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workout_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("workout_json", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_generated_workouts_workout_request_id",
        "generated_workouts",
        ["workout_request_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_generated_workouts_workout_request_id", table_name="generated_workouts")
    op.drop_table("generated_workouts")
    op.drop_table("workout_requests")
    op.drop_table("users")
