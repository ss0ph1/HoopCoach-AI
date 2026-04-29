"""add workout feedback

Revision ID: 20260429_0002
Revises: 20260428_0001
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260429_0002"
down_revision = "20260428_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workout_feedback",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column(
            "workout_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("generated_workouts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("difficulty_feedback", sa.String(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("workout_id", name="uq_workout_feedback_workout_id"),
    )
    op.create_index("ix_workout_feedback_workout_id", "workout_feedback", ["workout_id"])


def downgrade() -> None:
    op.drop_index("ix_workout_feedback_workout_id", table_name="workout_feedback")
    op.drop_table("workout_feedback")
