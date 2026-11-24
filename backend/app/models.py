"""Data model.

Program side: a program_version holds program_days; each day holds program_slots (in session
order) and cardio_entries. Exercises are shared across versions so history follows an exercise
from one version to the next; edits create a new program_version and old logs keep pointing at
the version they used.

Session side: one workout_session per calendar date, session_slots for per-slot state (status,
swap, later), set_logs under the exercise actually done, stop_events, notes.
"""

from datetime import UTC, date, datetime
from enum import StrEnum

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class Block(StrEnum):
    """Where a slot sits in a session. Sessions run in this order."""

    WARMUP = "warmup"
    MAIN = "main"
    CORE = "core"
    FOREARM = "forearm"
    CARDIO = "cardio"
    COOLDOWN = "cooldown"


BLOCK_ORDER = [b.value for b in Block]


class Pattern(StrEnum):
    PUSH = "PUSH"
    PULL = "PULL"
    CORE = "CORE"
    FOREARM = "FOREARM"


class Measure(StrEnum):
    REPS = "reps"
    SECONDS = "seconds"


class ExclusionKind(StrEnum):
    GOAL = "goal"  # reversible: a goal call
    SPINE_JOINT = "spine_joint"  # permanent: tissue tolerance, not a goal call


class NoteKind(StrEnum):
    CUE = "cue"  # pinned, follows the exercise
    CAP = "cap"  # pinned load cap ("Binding Vow")
    SESSION = "session"  # one workout only


# ---------------------------------------------------------------- exercises


class Exercise(Base):
    __tablename__ = "exercise"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    region: Mapped[str | None] = mapped_column(String(60))
    muscle: Mapped[str | None] = mapped_column(String(120))
    equipment: Mapped[str | None] = mapped_column(String(80))
    # Lower assistance is progress; PR logic inverts for these. `assisted` is what the importer
    # derives from the program's wording; `assisted_override` is yours (None = follow the
    # program) and the importer never touches it. Read `is_assisted`.
    assisted: Mapped[bool] = mapped_column(Boolean, default=False)
    assisted_override: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    measure: Mapped[str] = mapped_column(String(10), default=Measure.REPS.value)
    per_side: Mapped[bool] = mapped_column(Boolean, default=False)
    # A routine (warm-up / cool-down sequence) is done as a whole, never logged by set.
    routine: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    exclusion: Mapped["Exclusion | None"] = relationship(back_populates="exercise")
    media: Mapped[list["Media"]] = relationship(back_populates="exercise")

    @property
    def is_assisted(self) -> bool:
        if self.assisted_override is not None:
            return self.assisted_override
        return bool(self.assisted)


class Exclusion(Base):
    """An exercise kept out of the program, with the reason and whether it can come back."""

    __tablename__ = "exclusion"

    id: Mapped[int] = mapped_column(primary_key=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercise.id"), unique=True)
    kind: Mapped[str] = mapped_column(String(20))  # ExclusionKind
    label: Mapped[str | None] = mapped_column(String(40))  # e.g. GOAL, SPINE, SHOULDER
    reason: Mapped[str | None] = mapped_column(Text)
    revisit: Mapped[str | None] = mapped_column(Text)
    program_version_id: Mapped[int | None] = mapped_column(
        ForeignKey("program_version.id", ondelete="SET NULL")
    )

    exercise: Mapped[Exercise] = relationship(back_populates="exclusion")


class Swap(Base):
    """Ranked substitution: rank 1 is the first choice."""

    __tablename__ = "swap"
    __table_args__ = (UniqueConstraint("program_version_id", "exercise_id", "substitute_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    program_version_id: Mapped[int] = mapped_column(
        ForeignKey("program_version.id", ondelete="CASCADE")
    )
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercise.id"))
    substitute_id: Mapped[int] = mapped_column(ForeignKey("exercise.id"))
    rank: Mapped[int] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(Text)

    substitute: Mapped[Exercise] = relationship(foreign_keys=[substitute_id])


class Media(Base):
    __tablename__ = "media"

    id: Mapped[int] = mapped_column(primary_key=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercise.id"))
    kind: Mapped[str] = mapped_column(String(20))  # youtube | link | clip | photo
    label: Mapped[str | None] = mapped_column(String(120))
    url: Mapped[str | None] = mapped_column(Text)
    path: Mapped[str | None] = mapped_column(Text)  # under MEDIA_DIR, EXIF stripped
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    exercise: Mapped[Exercise] = relationship(back_populates="media")


# ---------------------------------------------------------------- program


class ProgramVersion(Base):
    __tablename__ = "program_version"

    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(40), unique=True)  # e.g. "v6.2"
    title: Mapped[str | None] = mapped_column(Text)
    source_name: Mapped[str | None] = mapped_column(String(255))  # file name only, no path
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    days: Mapped[list["ProgramDay"]] = relationship(
        back_populates="version", cascade="all, delete-orphan", order_by="ProgramDay.weekday"
    )


class ProgramDay(Base):
    __tablename__ = "program_day"
    __table_args__ = (UniqueConstraint("program_version_id", "key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    program_version_id: Mapped[int] = mapped_column(
        ForeignKey("program_version.id", ondelete="CASCADE")
    )
    key: Mapped[str] = mapped_column(String(20))  # gym1..gym5, sat, sun
    weekday: Mapped[int] = mapped_column(Integer)  # 0 = Monday
    name: Mapped[str] = mapped_column(String(80))  # "Upper 1"
    title: Mapped[str | None] = mapped_column(Text)
    subtitle: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[list[str]] = mapped_column(JSON, default=list)

    version: Mapped[ProgramVersion] = relationship(back_populates="days")
    slots: Mapped[list["ProgramSlot"]] = relationship(
        back_populates="day", cascade="all, delete-orphan", order_by="ProgramSlot.position"
    )
    cardio: Mapped[list["CardioEntry"]] = relationship(
        back_populates="day", cascade="all, delete-orphan", order_by="CardioEntry.position"
    )


class ProgramSlot(Base):
    __tablename__ = "program_slot"
    __table_args__ = (UniqueConstraint("program_day_id", "key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    program_day_id: Mapped[int] = mapped_column(ForeignKey("program_day.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(String(20))  # stable across re-imports: code (+ ordinal)
    position: Mapped[int] = mapped_column(Integer)  # session order, block order first
    block: Mapped[str] = mapped_column(String(10))  # Block
    code: Mapped[str] = mapped_column(String(10))  # 1-6, C1, C2, F1, F2, WU, CD, OPT
    pattern: Mapped[str | None] = mapped_column(String(10))  # Pattern
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercise.id"))
    # Either/or slots ("Seated DB or Machine Shoulder Press"): the second option.
    alt_exercise_id: Mapped[int | None] = mapped_column(ForeignKey("exercise.id"))
    display_name: Mapped[str] = mapped_column(Text)  # the name as the program writes it
    target_muscle: Mapped[str | None] = mapped_column(String(120))
    sets_min: Mapped[int | None] = mapped_column(Integer)
    sets_max: Mapped[int | None] = mapped_column(Integer)
    sets_text: Mapped[str | None] = mapped_column(String(80))
    measure: Mapped[str] = mapped_column(String(10), default=Measure.REPS.value)
    target_min: Mapped[int | None] = mapped_column(Integer)  # reps or seconds
    target_max: Mapped[int | None] = mapped_column(Integer)
    target_text: Mapped[str | None] = mapped_column(String(120))  # original text, always kept
    per_side: Mapped[bool] = mapped_column(Boolean, default=False)
    optional: Mapped[bool] = mapped_column(Boolean, default=False)
    rest_s: Mapped[int | None] = mapped_column(Integer)
    # False when the slot is shown as a checklist item only (routines, unparsed doses).
    loggable: Mapped[bool] = mapped_column(Boolean, default=True)

    day: Mapped[ProgramDay] = relationship(back_populates="slots")
    exercise: Mapped[Exercise] = relationship(foreign_keys=[exercise_id])
    alt_exercise: Mapped[Exercise | None] = relationship(foreign_keys=[alt_exercise_id])


class CardioEntry(Base):
    __tablename__ = "cardio_entry"

    id: Mapped[int] = mapped_column(primary_key=True)
    program_day_id: Mapped[int] = mapped_column(ForeignKey("program_day.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer)
    mode: Mapped[str] = mapped_column(String(80))  # "Air bike", "Incline walk"
    minutes_min: Mapped[int | None] = mapped_column(Integer)
    minutes_max: Mapped[int | None] = mapped_column(Integer)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)  # incline, speed_mph, ...
    text: Mapped[str | None] = mapped_column(Text)  # original wording

    day: Mapped[ProgramDay] = relationship(back_populates="cardio")


class Note(Base):
    """Pinned cue / cap notes follow an exercise; session notes belong to one workout."""

    __tablename__ = "note"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(10))  # NoteKind
    text: Mapped[str] = mapped_column(Text)
    exercise_id: Mapped[int | None] = mapped_column(ForeignKey("exercise.id"))
    # Set when the note came from the program (re-import replaces these, not your own notes).
    program_version_id: Mapped[int | None] = mapped_column(
        ForeignKey("program_version.id", ondelete="CASCADE")
    )
    program_slot_id: Mapped[int | None] = mapped_column(
        ForeignKey("program_slot.id", ondelete="SET NULL")
    )
    session_id: Mapped[int | None] = mapped_column(
        ForeignKey("workout_session.id", ondelete="CASCADE")
    )
    cap_lb: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ---------------------------------------------------------------- sessions


class WorkoutSession(Base):
    __tablename__ = "workout_session"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, unique=True)
    program_version_id: Mapped[int | None] = mapped_column(
        ForeignKey("program_version.id", ondelete="SET NULL")
    )
    program_day_id: Mapped[int | None] = mapped_column(
        ForeignKey("program_day.id", ondelete="SET NULL")
    )
    gear: Mapped[dict] = mapped_column(JSON, default=dict)
    # Cardio Done / Skip ticks, keyed cardio1.. in the day's cardio_entry position order.
    cardio: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}")
    finished: Mapped[bool] = mapped_column(Boolean, default=False)
    # Rest timer for this session only (the pager's toggle): "on", "off", or None to follow
    # the account setting.
    rest_timer: Mapped[str | None] = mapped_column(String(8))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    slots: Mapped[list["SessionSlot"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="SessionSlot.position"
    )


class SessionSlot(Base):
    __tablename__ = "session_slot"
    __table_args__ = (UniqueConstraint("session_id", "slot_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("workout_session.id", ondelete="CASCADE"))
    slot_key: Mapped[str] = mapped_column(String(20))
    program_slot_id: Mapped[int | None] = mapped_column(
        ForeignKey("program_slot.id", ondelete="SET NULL")
    )
    position: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(10), default="todo")
    swapped_to_id: Mapped[int | None] = mapped_column(ForeignKey("exercise.id"))
    done_as_id: Mapped[int | None] = mapped_column(ForeignKey("exercise.id"))
    later: Mapped[bool] = mapped_column(Boolean, default=False)
    # Sets planned for today after "+ Add set" / "Remove set"; None = the program's count.
    planned_sets: Mapped[int | None] = mapped_column(Integer)

    session: Mapped[WorkoutSession] = relationship(back_populates="slots")


class SetLog(Base):
    """One logged set, under the exercise actually done.

    weight_lb is assistance for assisted exercises. reps or seconds per the exercise's measure;
    for per-side exercises the count is per side.
    """

    __tablename__ = "set_log"
    __table_args__ = (UniqueConstraint("session_id", "slot_key", "set_index"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[str] = mapped_column(String(80), unique=True)  # idempotent sync
    session_id: Mapped[int] = mapped_column(ForeignKey("workout_session.id", ondelete="CASCADE"))
    slot_key: Mapped[str] = mapped_column(String(20))
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercise.id"))
    set_index: Mapped[int] = mapped_column(Integer)
    weight_lb: Mapped[float | None] = mapped_column(Float)
    reps: Mapped[int | None] = mapped_column(Integer)
    seconds: Mapped[int | None] = mapped_column(Integer)
    rir: Mapped[int | None] = mapped_column(Integer)
    is_pr: Mapped[bool] = mapped_column(Boolean, default=False)
    logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class StopEvent(Base):
    __tablename__ = "stop_event"
    __table_args__ = (UniqueConstraint("session_id", "slot_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[str] = mapped_column(String(80), unique=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("workout_session.id", ondelete="CASCADE"))
    slot_key: Mapped[str] = mapped_column(String(20))
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercise.id"))
    set_index: Mapped[int] = mapped_column(Integer)
    weight_lb: Mapped[float | None] = mapped_column(Float)
    symptom: Mapped[str] = mapped_column(String(60))
    note: Mapped[str | None] = mapped_column(Text)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BodyMetric(Base):
    __tablename__ = "body_metric"
    __table_args__ = (UniqueConstraint("date", "kind"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date)
    kind: Mapped[str] = mapped_column(String(20))  # bodyweight | waist
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(10))  # lb | in


class AccountSetting(Base):
    """Account-wide settings, so every signed-in device agrees (e.g. rest_timer_mode -> "set").

    A setting with no row has its default, defined in api.SETTINGS.
    """

    __tablename__ = "account_setting"

    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)  # {"v": <value>}


# ---------------------------------------------------------------- login


class AuthConfig(Base):
    """One row: the owner's WebAuthn user handle and the TOTP secret (enrollment only)."""

    __tablename__ = "auth_config"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_handle: Mapped[bytes] = mapped_column(LargeBinary)
    totp_secret: Mapped[str | None] = mapped_column(String(64))  # base32, active
    totp_pending: Mapped[str | None] = mapped_column(String(64))  # base32, awaiting confirm
    totp_last_step: Mapped[int | None] = mapped_column(Integer)  # replay guard


class Passkey(Base):
    __tablename__ = "passkey"

    id: Mapped[int] = mapped_column(primary_key=True)
    credential_id: Mapped[bytes] = mapped_column(LargeBinary, unique=True)
    public_key: Mapped[bytes] = mapped_column(LargeBinary)
    sign_count: Mapped[int] = mapped_column(Integer, default=0)
    transports: Mapped[list] = mapped_column(JSON, default=list)
    name: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthSession(Base):
    """Server-side session. Only the SHA-256 of the cookie token is stored."""

    __tablename__ = "auth_session"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    passkey_id: Mapped[int | None] = mapped_column(ForeignKey("passkey.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(160))


class RecoveryCode(Base):
    """One-time codes that can authorize enrolling a new passkey. Only hashes are stored."""

    __tablename__ = "recovery_code"

    id: Mapped[int] = mapped_column(primary_key=True)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthEvent(Base):
    """Authentication events only: never health data, notes or request bodies."""

    __tablename__ = "auth_event"

    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    kind: Mapped[str] = mapped_column(String(40))
    ok: Mapped[bool] = mapped_column(Boolean)
    detail: Mapped[str | None] = mapped_column(String(200))
